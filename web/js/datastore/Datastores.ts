import {Datastore, DocMetaMutation, DocMetaSnapshotBatch, DocMetaSnapshotEventListener, SnapshotResult} from './Datastore';
import {NetworkLayer} from './Datastore';
import {FileRef} from './Datastore';
import {BackendFileRef} from './Datastore';
import {MemoryDatastore} from './MemoryDatastore';
import {DiskDatastore} from './DiskDatastore';
import {Logger} from '../logger/Logger';
import {DocMetaFileRefs, DocMetaRef} from './DocMetaRef';
import {DocMeta} from '../metadata/DocMeta';
import {DocMetas} from '../metadata/DocMetas';
import {NULL_FUNCTION} from '../util/Functions';
import {Percentages} from '../util/Percentages';
import {ProgressTracker} from '../util/ProgressTracker';
import {AsyncProviders} from '../util/Providers';
import {DefaultPersistenceLayer} from './DefaultPersistenceLayer';
import {DocInfo} from '../metadata/DocInfo';
import deepEqual from 'deep-equal';
import {Preconditions} from '../Preconditions';
import {AsyncFunction, AsyncWorkQueue} from '../util/AsyncWorkQueue';
import {Backend} from './Backend';
import {Either} from '../util/Either';
import {LeftEither} from '../util/Either';
import {DocInfoLike} from '../metadata/DocInfo';

const log = Logger.create();

const ENV_POLAR_DATASTORE = 'POLAR_DATASTORE';

export class Datastores {

    public static create(): Datastore {

        const name = process.env[ENV_POLAR_DATASTORE];

        if (name === 'MEMORY') {
            log.info("Using memory datastore");
            return new MemoryDatastore();
        }

        return new DiskDatastore();

    }

    /**
     * Get the main BackendFileRef (PHZ or PDF) for this file (either the
     * PHZ or PDF file)
     */
    public static toBackendFileRef(either: LeftEither<DocMeta, DocInfoLike>): BackendFileRef | undefined {

        if (! either) {
            return undefined;
        }

        const docInfo =
            Either.ofLeft(either)
                  .convertLeftToRight(left => left.docInfo);

        if (docInfo.filename) {

            // return the existing doc meta information.

            const backend = docInfo.backend || Backend.STASH;

            const backendFileRef: BackendFileRef = {
                name: docInfo.filename,
                hashcode: docInfo.hashcode,
                backend
            };

            return backendFileRef;

        }

        return undefined;

    }

    /**
     * Get all FileRefs for this DocMeta including the main doc but also
     * any image, audio, or video attachments.
     */
    public static toBackendFileRefs(either: LeftEither<DocMeta, DocInfoLike>): ReadonlyArray<BackendFileRef> {

        const result: BackendFileRef[] = [];

        const fileRef = this.toBackendFileRef(either);

        const docInfo =
            Either.ofLeft(either)
                .convertLeftToRight(left => left.docInfo);

        if (fileRef) {

            const backend = docInfo.backend || Backend.STASH;

            // this is the main FileRef of the file (PHZ or PDF)
            result.push({backend, ...fileRef});

        }

        const attachments = docInfo.attachments || {};
        const attachmentRefs = Object.values(attachments)
            .map(current => current.data);

        result.push(...attachmentRefs);

        return result;

    }

    public static async getDocMetas(datastore: Datastore,
                                    listener: DocMetaListener,
                                    docMetaRefs?: DocMetaRef[]) {

        if (!docMetaRefs) {
            docMetaRefs = await datastore.getDocMetaRefs();
        }

        for (const docMetaRef of docMetaRefs) {
            const docMetaData = await datastore.getDocMeta(docMetaRef.fingerprint);

            if ( ! docMetaData) {
                throw new Error("Could not find docMeta for fingerprint: " + docMetaRef.fingerprint);
            }

            const docMeta = DocMetas.deserialize(docMetaData, docMetaRef.fingerprint);
            listener(docMeta);
        }

    }

    /**
     * Create a committed snapshot from an existing datastore so that legacy
     * ones seem to support snapshots though they might not support updates of
     * the listeners.
     */
    public static async createCommittedSnapshot(datastore: Datastore,
                                                listener: DocMetaSnapshotEventListener,
                                                batch?: DocMetaSnapshotBatch): Promise<SnapshotResult> {

        if (! batch) {

            // for most of our usages we just receive the first batch and we're
            // done at that point.

            batch = {
                id: 0,
                terminated: false
            };

        }

        const docMetaFiles = await datastore.getDocMetaRefs();

        const progressTracker = new ProgressTracker(docMetaFiles.length,
                                                    `datastore:${datastore.id}#snapshot`);

        // TODO: we call the listener too many times here but we might want to
        // batch it in the future so that the listener doesn't get called too
        // often as it would update the UI too frequently.  We need to compute
        // the ideal batch size so we should probably compute it as:

        // const percMax = 100;
        // const minBatchSize = 1;
        // const maxBatchSize = 20;
        //
        // Math.max(minBatchSize, Math.min(maxBatchSize, docMetaFiles.length /
        // percMax))   This will give us an ideal batch size so that we update
        // the UI every 1% OR the maxBatchSize...

        for (const docMetaFile of docMetaFiles) {

            // // TODO: in the cloud store implementation it will probably be much
            // // faster to use a file JUST for the DocInfo to speed up loading.
            const dataProvider = AsyncProviders.memoize(async () => await datastore.getDocMeta(docMetaFile.fingerprint));
            const docMetaProvider = AsyncProviders.memoize(async () => DocMetas.deserialize((await dataProvider())!, docMetaFile.fingerprint));
            const docInfoProvider = AsyncProviders.memoize(async () => (await docMetaProvider()).docInfo);
            const docMetaFileRefProvider = AsyncProviders.memoize(async () => DocMetaFileRefs.createFromDocInfo(await docInfoProvider()));

            const docMetaMutation: DocMetaMutation = {
                fingerprint: docMetaFile.fingerprint,
                docMetaFileRefProvider,
                dataProvider,
                docMetaProvider,
                docInfoProvider,
                mutationType: 'created'
            };

            await listener({
                datastore: datastore.id,
                progress: progressTracker.incr(),
                consistency: 'committed',
                docMetaMutations: [docMetaMutation],
                batch
            });

        }

        await listener({
            datastore: datastore.id,
            progress: progressTracker.terminate(),
            consistency: 'committed',
            docMetaMutations: [],
            batch: {
                id: batch.id,
                terminated: true,
            }
        });

        return { };

    }

    /**
     * Remove all the docs in a datastore.  Only do this for testing and for
     * very important use cases.
     */
    public static async purge(datastore: Datastore,
                              purgeListener: PurgeListener = NULL_FUNCTION) {

        const docMetaFiles = await datastore.getDocMetaRefs();

        let completed: number = 0;
        const total: number = docMetaFiles.length;

        const work: AsyncFunction[] = [];

        const asyncWorkQueue = new AsyncWorkQueue(work);

        for (const docMetaFile of docMetaFiles) {

            // TODO: we're not purging the files associated with the docs... the
            // stash file is purged as part of the delete right now and I could
            // put the other files there as well so that way we always make sure
            // there are no dependencies tangling

            // TODO: use a ProgressTracker here instead of computing the progress
            // directly which is error prone.

            work.push(async () => {

                const data = await datastore.getDocMeta(docMetaFile.fingerprint);
                const docMeta = DocMetas.deserialize(data!, docMetaFile.fingerprint);

                const docMetaFileRef = DocMetaFileRefs.createFromDocInfo(docMeta.docInfo);

                await datastore.delete(docMetaFileRef);

                ++completed;

                const progress = Percentages.calculate(completed, total);

                purgeListener({completed, total, progress});

            });

        }

        await asyncWorkQueue.execute();

        if (total === 0) {
            purgeListener({completed, total, progress: 100});
        }

    }

    /**
     * Compare two filesystems and make sure they're consistent.
     *
     */
    public static async checkConsistency(datastore0: Datastore,
                                         datastore1: Datastore): Promise<DatastoreConsistency> {

        // get the docMetas in both, then compare them...

        const manifest0 = await this.toDocInfoManifest(datastore0);
        const manifest1 = await this.toDocInfoManifest(datastore1);

        const consistent = deepEqual(manifest0, manifest1);

        return {consistent, manifest0, manifest1};

    }

    public static async toDocInfoManifest(datastore: Datastore): Promise<ReadonlyArray<DocInfo>> {

        const persistenceLayer = new DefaultPersistenceLayer(datastore);

        const docMetaFiles =
            (await datastore.getDocMetaRefs())
                .sort((d0, d1) => d0.fingerprint.localeCompare(d1.fingerprint));

        const result: DocInfo[] = [];

        for (const docMetaFile of docMetaFiles) {
            const docMeta = await persistenceLayer.getDocMeta(docMetaFile.fingerprint);
            Preconditions.assertPresent(docMeta, "toDocInfoManifest could not find docMeta for " + docMetaFile.fingerprint);
            result.push(docMeta!.docInfo);
        }

        return result;

    }

    /**
     * Assert that the specified network layer is supported by this datastore.
     */
    public static assertNetworkLayer(datastore: Datastore, networkLayer?: NetworkLayer) {

        if (! networkLayer) {
            // we support this because it's not specified.
            return;
        }

        const capabilities = datastore.capabilities();

        if (! capabilities.networkLayers.has(networkLayer)) {
            throw new Error(`Datastore '${datastore.id}' does not support ${networkLayer} only ${capabilities.networkLayers}`);
        }

    }


}

export type DocMetaListener = (docMeta: DocMeta) => void;

export interface PurgeEvent {
    readonly completed: number;
    readonly total: number;
    readonly progress: number;
}

export type PurgeListener = (purgeEvent: PurgeEvent) => void;

export interface DatastoreConsistency {
    readonly consistent: boolean;
    readonly manifest0: ReadonlyArray<DocInfo>;
    readonly manifest1: ReadonlyArray<DocInfo>;
}
