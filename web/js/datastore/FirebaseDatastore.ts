import {AbstractDatastore, BinaryFileData, Datastore, DatastoreConsistency, DatastoreInitOpts, DatastoreOverview, DeleteResult, DocMetaMutation, DocMetaSnapshotEvent, DocMetaSnapshotEventListener, ErrorListener, FileRef, InitResult, MutationType, PrefsProvider, SnapshotResult, Visibility} from './Datastore';
import {WritableBinaryMetaDatastore} from './Datastore';
import {DefaultWriteFileOpts} from './Datastore';
import {DatastoreCapabilities} from './Datastore';
import {GetFileOpts} from './Datastore';
import {WriteFileOpts} from './Datastore';
import {NetworkLayers} from './Datastore';
import {WriteOpts} from './Datastore';
import {FileMeta} from './Datastore';
import {Logger} from '../logger/Logger';
import {DocMetaFileRef, DocMetaFileRefs, DocMetaRef} from './DocMetaRef';
import {Backend} from './Backend';
import {DocFileMeta} from './DocFileMeta';
import {Optional} from '../util/ts/Optional';
import {Firestore} from '../firebase/Firestore';
import {DocInfo, IDocInfo} from '../metadata/DocInfo';
import {Preconditions} from '../Preconditions';
import {isPresent} from '../Preconditions';
import {Hashcodes} from '../Hashcodes';
import * as firebase from '../firebase/lib/firebase';
import {Dictionaries} from '../util/Dictionaries';
import {DatastoreMutation, DefaultDatastoreMutation} from './DatastoreMutation';
import {NULL_FUNCTION} from '../util/Functions';
import {DocMetas} from "../metadata/DocMetas";
import {Percentages} from '../util/Percentages';
import {Percentage, ProgressTracker} from '../util/ProgressTracker';
import {AsyncProviders, Providers} from '../util/Providers';
import {FilePaths} from '../util/FilePaths';
import {FileHandle, FileHandles} from '../util/Files';
import {UserID} from '../firebase/Firebase';
import {IEventDispatcher, SimpleReactor} from '../reactor/SimpleReactor';
import {LocalStoragePrefs} from '../util/prefs/Prefs';
import {ProgressMessage} from '../ui/progress_bar/ProgressMessage';
import {ProgressMessages} from '../ui/progress_bar/ProgressMessages';
import {Stopwatches} from '../util/Stopwatches';
import {AppRuntime} from '../AppRuntime';
import {Promises} from '../util/Promises';
import {URLs} from '../util/URLs';
import {Datastores} from './Datastores';
import {Latch} from '../util/Latch';

const log = Logger.create();

let STORAGE_UPLOAD_ID: number = 0;

export class FirebaseDatastore extends AbstractDatastore implements Datastore, WritableBinaryMetaDatastore {

    public readonly id = 'firebase';

    private app?: firebase.app.App;

    private firestore?: firebase.firestore.Firestore;

    private storage?: firebase.storage.Storage;

    private initialized: boolean = false;

    private primarySnapshot?: SnapshotResult;

    private readonly docMetaSnapshotEventDispatcher: IEventDispatcher<DocMetaSnapshotEvent> = new SimpleReactor();

    constructor() {
        super();
    }

    public async init(errorListener: ErrorListener = NULL_FUNCTION,
                      opts: DatastoreInitOpts = {}): Promise<InitResult> {

        if (this.initialized) {
            return {};
        }

        // get the firebase app. Make sure we are initialized externally.
        this.app = firebase.app();
        this.firestore = await Firestore.getInstance();
        this.storage = firebase.storage();

        if (opts.noInitialSnapshot) {
            log.debug("Skipping initial snapshot");
        } else {

            log.debug("Performing initial snapshot");

            // do not run this if we specify options of noInitialSnapshot

            const snapshotListener = async (event: DocMetaSnapshotEvent) => this.docMetaSnapshotEventDispatcher.dispatchEvent(event);

            this.primarySnapshot = await this.snapshot(snapshotListener, errorListener);

        }

        this.initialized = true;

        return {};

    }

    public async snapshot(docMetaSnapshotEventListener: DocMetaSnapshotEventListener,
                          errorListener: ErrorListener = NULL_FUNCTION): Promise<SnapshotResult> {

        // setup the initial snapshot so that we query for the users existing
        // data...

        const uid = FirebaseDatastore.getUserID();

        // start synchronizing the datastore.  You MUST register your listeners
        // BEFORE calling init if you wish to listen to the full stream of
        // events.

        // There's no way to control where the snapshot comes from and on
        // startup so we do a get() from the cache which we can control with
        // GetOptions.  This gets us data quickly and then we start listening to
        // snapshots after this which can come from the network async

        const query = this.firestore!
            .collection(DatastoreCollection.DOC_INFO)
            .where('uid', '==', uid);

        type BatchIDMap = {
            [P in DatastoreConsistency]: number;
        };

        const batchIDs: BatchIDMap = {
            written: 0,
            committed: 0
        };

        const onNextForSnapshot = (snapshot: firebase.firestore.QuerySnapshot) => {

            try {

                const consistency = this.toConsistency(snapshot);
                const batchID = batchIDs[consistency];

                this.handleDocInfoSnapshot(snapshot, docMetaSnapshotEventListener, batchID);

                batchIDs[consistency]++;

            } catch (e) {
                log.error("Could not handle snapshot: ", e);
                errorListener(e);
            }

        };

        const onSnapshotError = (err: Error) => {
            log.error("Could not handle snapshot: ", err);
            errorListener(err);
        };


        if (this.preferredSource() === 'cache') {

            // Try to get the FIRST snapshot from the cache if possible and then
            // continue after that working with server snapshots and updated
            // data

            try {

                const stopwatch = Stopwatches.create();
                const cachedSnapshot = await query.get({ source: 'cache' });
                log.info("Initial cached snapshot duration: ", stopwatch.stop());

                onNextForSnapshot(cachedSnapshot);

            } catch (e) {
                // no cached snapshot is available and that's ok.
            }

        }

        const unsubscribe =
            query.onSnapshot({includeMetadataChanges: true}, onNextForSnapshot, onSnapshotError);

        return {
            unsubscribe
        };

    }

    public async stop() {

        if (this.primarySnapshot && this.primarySnapshot.unsubscribe) {
            this.primarySnapshot.unsubscribe();
        }

    }

    /**
     * Return true if the DiskDatastore contains a document for the given
     * fingerprint
     */
    public async contains(fingerprint: string): Promise<boolean> {

        // TODO: this isn't particularly efficient now but I don't think we're
        // actually using contains() for anything and we might want to remove
        // it since it's not very efficient if we just call getDocMeta anyway.
        const docMeta = await this.getDocMeta(fingerprint);

        return docMeta !== null;

    }

    public async delete(docMetaFileRef: DocMetaFileRef,
                        datastoreMutation: DatastoreMutation<boolean> = new DefaultDatastoreMutation()): Promise<Readonly<DeleteResult>> {

        log.info("delete: ", docMetaFileRef);

        if (docMetaFileRef.docFile && docMetaFileRef.docFile.name) {

            // the PDF/PHZ data file should be added as a stash file via
            // writeFile so it also needs to be removed.
            await this.deleteFile(Backend.STASH, docMetaFileRef.docFile);

        }

        const id = FirebaseDatastore.computeDocMetaID(docMetaFileRef.fingerprint);

        const docInfoRef = this.firestore!
            .collection(DatastoreCollection.DOC_INFO)
            .doc(id);

        const docMetaRef = this.firestore!
            .collection(DatastoreCollection.DOC_META)
            .doc(id);

        try {

            this.handleDatastoreMutations(docMetaRef, datastoreMutation, 'delete');

            const commitPromise = Promise.all([
                this.waitForCommit(docMetaRef),
                this.waitForCommit(docInfoRef)
            ]);

            const batch = this.firestore!.batch();

            batch.delete(docInfoRef);
            batch.delete(docMetaRef);

            await batch.commit();

            await commitPromise;

            return { };

        } finally {
            // noop for now
        }

    }

    /**
     * Get the DocMeta we currently in the datastore for this given
     * fingerprint or null if it does not exist.
     */
    public async getDocMeta(fingerprint: string, opts: GetDocMetaOpts = {}): Promise<string | null> {

        const id = FirebaseDatastore.computeDocMetaID(fingerprint);

        return await this.getDocMetaDirectly(id, opts);

    }

    /**
     * Get the DocMeta if from teh raw ID.
     * @param id
     */
    public async getDocMetaDirectly(id: string,
                                    opts: GetDocMetaOpts = {}): Promise<string | null> {

        const ref = this.firestore!
            .collection(DatastoreCollection.DOC_META)
            .doc(id);

        const createSnapshot = async () => {

            // TODO: lift this out into its own method.

            const preferredSource = opts.preferredSource || this.preferredSource();

            if (preferredSource === 'cache') {

                // Firebase supports three cache strategies.  The first
                // (default) is server with fall back to cache but what we
                // need is the reverse.  We need cache but server refresh to
                // pull the up-to-date copy.
                //
                // What we now do is we get two promises, then return the
                // first that works or throw an error if both fail.
                //
                // In this situation we ALWAYs go to the server though
                // because we need to get the up-to-date copy to refresh
                // BUT we can get the initial version FASTER since we
                // can resolve it from cache.

                const cachePromise = ref.get({ source: 'cache' });
                const serverPromise = ref.get({ source: 'server' });

                return await Promises.any(cachePromise, serverPromise);

            } else if (isPresent(opts.preferredSource)) {
                return await ref.get({ source: opts.preferredSource });
            } else {
                // now revert to checking the server, then cache if we're
                // offline.
                return await ref.get();
            }

        };

        const snapshot = await createSnapshot();

        const recordHolder = <RecordHolder<DocMetaHolder> | undefined> snapshot.data();

        if (! recordHolder) {
            log.warn("Could not get docMeta with id: " + id);
            return null;
        }

        return recordHolder.value.value;

    }

    /**
     * We have to keep track of pending file writes because it's possible that
     * two systems race and attempt to write the same file at once.
     *
     * TODO: We should probably abort this in the future if the hashcodes for
     * the documents we're trying to write are present but not identical or the
     * visibility settings are different.  Either that or stack them so that
     * the second (with different settings) is performed after the first.
     */
    private pendingFileWrites: {[key: string]: Latch<DocFileMeta>} = {};

    public async writeFile(backend: Backend,
                           ref: FileRef,
                           data: BinaryFileData,
                           opts: WriteFileOpts = new DefaultWriteFileOpts()): Promise<DocFileMeta> {

        // TODO: the latch handling, file writing, and progress notification
        // should all be decoupled into their own functions.

        log.debug(`writeFile: ${backend}: `, ref);

        const storagePath = this.computeStoragePath(backend, ref);
        const pendingFileWriteKey = storagePath.path;

        let latch = this.pendingFileWrites[pendingFileWriteKey];

        if (latch) {
            log.warn("Write already pending.  Going to return latch.");
            return this.pendingFileWrites[pendingFileWriteKey].get();
        }

        latch = this.pendingFileWrites[pendingFileWriteKey] = new Latch();

        try {

            const visibility = opts.visibility || Visibility.PRIVATE;

            const storage = this.storage!;

            const fileRef = storage.ref().child(storagePath.path);

            if (!isPresent(data)) {

                if (opts.updateMeta) {

                    const meta: FileMeta = { visibility };

                    // https://firebase.google.com/docs/storage/web/file-metadata
                    //
                    // Only the properties specified in the metadata are updated,
                    // all others are left unmodified.

                    await fileRef.updateMetadata(meta);

                    log.info("File metadata updated with: ", meta);

                    // TODO: I don't like having to call getFile again but hopefully
                    // it should be cached at this point.
                    return (await this.getFile(backend, ref)).get();

                } else {
                    // when the caller specifies null they mean that there's a
                    // metadata update which needs to be applied.
                    throw new Error("No data present");
                }

            }

            if (await this.containsFile(backend, ref)) {
                // the file is already in the datastore so don't attempt to
                // overwrite it for now.  The files are immutable and we don't
                // accept overwrites.
                return (await this.getFile(backend, ref)).get();
            }

            let uploadTask: firebase.storage.UploadTask;

            const uid = FirebaseDatastore.getUserID();

            // stick the uid into the metadata which we use for authorization of the
            // blob when not public.
            const meta = { uid, visibility };

            const metadata: firebase.storage.UploadMetadata = { customMetadata: meta };

            if (storagePath.settings) {
                metadata.contentType = storagePath.settings.contentType;
                metadata.cacheControl = storagePath.settings.cacheControl;
            }

            if (typeof data === 'string') {
                uploadTask = fileRef.putString(data, 'raw', metadata);
            } else if (data instanceof Blob) {
                uploadTask = fileRef.put(data, metadata);
            } else {

                if (FileHandles.isFileHandle(data)) {

                    // This only happens in the desktop app so we can read file URLs
                    // to blobs and otherwise it converts URLs to files.
                    const fileHandle = <FileHandle> data;

                    const fileURL = FilePaths.toURL(fileHandle.path);
                    const blob = await URLs.toBlob(fileURL);
                    uploadTask = fileRef.put(blob, metadata);

                } else {
                    uploadTask = fileRef.put(Uint8Array.from(<Buffer> data), metadata);
                }

            }

            // TODO: we can get progress from the uploadTask here.

            const started = Date.now();

            const task = ProgressTracker.createNonce();

            // TODO: create an index of pending progress messages and show the
            // OLDEST on in the progress bar.. but add like a 5 minute timeout in
            // case it's not updated.   Each progress message MUST have a 'created'
            // timestamp from now on so we can GC them and or ignore them if they're
            // never used again

            const progressID = 'firebase-upload-' + STORAGE_UPLOAD_ID++;

            uploadTask.on('state_changed', (snapshotData: any) => {

                const snapshot: firebase.storage.UploadTaskSnapshot = snapshotData;

                const now = Date.now();
                const duration = now - started;

                const percentage = Percentages.calculate(snapshot.bytesTransferred, snapshot.totalBytes);
                log.notice('Upload is ' + percentage + '% done');

                const progress: ProgressMessage = {
                    id: progressID,
                    task,
                    completed: snapshot.bytesTransferred,
                    total: snapshot.totalBytes,
                    duration,
                    progress: <Percentage> percentage,
                    timestamp: Date.now(),
                    name: `${backend}/${ref.name}`
                };

                ProgressMessages.broadcast(progress);

                switch (snapshot.state) {

                    case firebase.storage.TaskState.PAUSED:
                        // or 'paused'
                        // console.log('Upload is paused');
                        break;

                    case firebase.storage.TaskState.RUNNING:
                        // or 'running'
                        // console.log('Upload is running');
                        break;
                }

            });

            const uploadTaskSnapshot = await uploadTask;

            const downloadURL = uploadTaskSnapshot.downloadURL;

            const result: DocFileMeta = {
                backend,
                ref,
                url: downloadURL!
            };

            latch.resolve(result);

            // now we have to clean up after our latch.
            delete this.pendingFileWrites[pendingFileWriteKey];

            return result;

        } catch (e) {
            latch.reject(e);
            throw e;
        }

    }

    private createFileMetaID(backend: Backend, ref: FileRef) {
        const storagePath = this.computeStoragePath(backend, ref);
        return Hashcodes.create(storagePath.path);
    }

    public async getFile(backend: Backend,
                         ref: FileRef,
                         opts: GetFileOpts = {}): Promise<Optional<DocFileMeta>> {

        Datastores.assertNetworkLayer(this, opts.networkLayer);

        log.debug("getFile");

        const storage = this.storage!;

        const storagePath = this.computeStoragePath(backend, ref);

        const storageRef = storage.ref().child(storagePath.path);

        const downloadURL =
            await DownloadURLs.computeDownloadURL(backend, ref, storagePath, storageRef, opts);

        if (! downloadURL) {
            return Optional.empty();
        }

        const url: string = this.wrappedDownloadURL(downloadURL);

        return Optional.of({ backend, ref, url});

    }
    /**
     * Optionally wrap the download URL with a middleware URL which can perform
     * operations like authentication for the underlying download URL.
     */
    private wrappedDownloadURL(url: string) {

        return url;

        // this is disabled for now.
        // return "https://us-central1-polar-cors.cloudfunctions.net/cors?url=" + encodeURIComponent(url);

    }

    public async containsFile(backend: Backend, ref: FileRef): Promise<boolean> {

        const storagePath = this.computeStoragePath(backend, ref);

        const storage = this.storage!;
        const storageRef = storage.ref().child(storagePath.path);

        const downloadURL =
            await DownloadURLs.computeDownloadURL(backend, ref, storagePath, storageRef, {});

        return isPresent(downloadURL);

    }

    public async deleteFile(backend: Backend, ref: FileRef): Promise<void> {

        log.debug("deleteFile: ", backend, ref);

        try {

            const storage = this.storage!;

            const storagePath = this.computeStoragePath(backend, ref);

            const fileRef = storage.ref().child(storagePath.path);
            await fileRef.delete();

        } catch (e) {

            if (e.code === "storage/object-not-found") {
                // this is acceptable for now as we want deletes to be
                // idempotent
                return;
            }

            // some other type of exception ias occurred
            throw e;

        }

    }

    /**
     * Write the datastore to disk.
     */
    public async write(fingerprint: string,
                       data: string,
                       docInfo: DocInfo,
                       opts: WriteOpts = {}) {

        await this.handleWriteFile(opts);

        const datastoreMutation = opts.datastoreMutation || new DefaultDatastoreMutation();

        try {

            docInfo = Object.assign({}, Dictionaries.onlyDefinedProperties(docInfo));

            const id = FirebaseDatastore.computeDocMetaID(fingerprint);

            const docMetaRef = this.firestore!
                .collection(DatastoreCollection.DOC_META)
                .doc(id);

            const docInfoRef = this.firestore!
                .collection(DatastoreCollection.DOC_INFO)
                .doc(id);

            this.handleDatastoreMutations(docMetaRef, datastoreMutation, 'write');

            const commitPromise = Promise.all([
                this.waitForCommit(docMetaRef),
                this.waitForCommit(docInfoRef)
            ]);

            log.debug("Setting...");

            const batch = this.firestore!.batch();

            const visibility = docInfo.visibility;

            log.info(`Write of doc with id ${id} and visibility: ${visibility}`);

            batch.set(docMetaRef, this.createDocForDocMeta(docInfo, data, visibility));
            batch.set(docInfoRef, this.createDocForDocInfo(docInfo, visibility));

            await batch.commit();

            log.debug("Setting...done");

            // we need to make sure that we only return when it's committed
            // remotely...
            log.debug("Waiting for promise...");
            await commitPromise;
            log.debug("Waiting for promise...done");

        } finally {
            // noop for now
        }

    }

    public async overview(): Promise<DatastoreOverview | undefined> {
        return undefined;
    }

    public capabilities(): DatastoreCapabilities {

        return {
            networkLayers: NetworkLayers.WEB,
            permission: {mode: 'rw'}
        };

    }

    public getPrefs(): PrefsProvider {
        return Providers.toInterface(() => new LocalStoragePrefs());
    }

    /**
     * Create the document that we will store in for the DocMeta
     */
    private createDocForDocMeta(docInfo: DocInfo,
                                docMeta: string,
                                visibility: Visibility = Visibility.PRIVATE) {

        const uid = FirebaseDatastore.getUserID();
        const id = FirebaseDatastore.computeDocMetaID(docInfo.fingerprint, uid);

        const docMetaHolder: DocMetaHolder = {
            docInfo,
            value: docMeta
        };

        const recordHolder: RecordHolder<DocMetaHolder> = {
            uid,
            id,
            visibility,
            value: docMetaHolder
        };

        return recordHolder;

    }

    private createDocForDocInfo(docInfo: DocInfo,
                                visibility: Visibility = Visibility.PRIVATE) {

        const uid = FirebaseDatastore.getUserID();
        const id = FirebaseDatastore.computeDocMetaID(docInfo.fingerprint, uid);

        const recordHolder: RecordHolder<DocInfo> = {
            uid,
            id,
            visibility,
            value: docInfo
        };

        return recordHolder;

    }

    public async getDocMetaRefs(): Promise<DocMetaRef[]> {

        const uid = FirebaseDatastore.getUserID();

        const snapshot = await this.firestore!
            .collection(DatastoreCollection.DOC_META)
            .where('uid', '==', uid)
            .get();

        const result: DocMetaRef[] = [];

        for (const doc of snapshot.docs) {

            const recordHolder = <RecordHolder<DocMetaHolder>> doc.data();

            result.push({fingerprint: recordHolder.value.docInfo.fingerprint});

        }

        return result;

    }

    private computeStoragePath(backend: Backend, fileRef: FileRef): StoragePath {

        const ext = FilePaths.toExtension(fileRef.name);

        const suffix = ext.map(value => {

                if ( ! value.startsWith('.') ) {
                    // if the suffix doesn't begin with a '.' then add it.
                    value = '.' + value;
                }

                return value;

            })
            .getOrElse('');

        const settings = this.computeStorageSettings(ext).getOrUndefined();

        let key: any;

        const uid = FirebaseDatastore.getUserID();

        if (fileRef.hashcode) {

            key = {

                // We include the uid of the user to avoid the issue of user
                // conflicting on files and the ability to share them per file.
                // The cloud storage costs for raw binary files are
                // inconsequential so have one file per user.

                uid,
                backend,
                alg: fileRef.hashcode.alg,
                enc: fileRef.hashcode.enc,
                data: fileRef.hashcode.data,
                suffix

            };

        } else {

            // Build a unique name from the filename and the UUID of the user.
            // this shouldn't actually be used except in the cases of VERY old
            // datastores.
            //
            key = {
                uid,
                filename: fileRef.name
            };

        }

        const id = Hashcodes.createID(key, 40);

        const path = `${backend}/${id}${suffix}`;

        return {path, settings};

    }

    private computeStorageSettings(optionalExt: Optional<string>): Optional<StorageSettings> {

        const PUBLIC_MAX_AGE_1WEEK = 'public,max-age=604800';

        const ext = optionalExt.getOrElse('').toLowerCase();

        if (ext === 'jpg' || ext === 'jpeg') {

            return Optional.of({
                cacheControl: PUBLIC_MAX_AGE_1WEEK,
                contentType: 'image/jpeg'
            });

        }

        if (ext === 'pdf') {

            return Optional.of({
                cacheControl: PUBLIC_MAX_AGE_1WEEK,
                contentType: 'application/pdf'
            });

        }

        if (ext === 'png') {

            return Optional.of({
                cacheControl: PUBLIC_MAX_AGE_1WEEK,
                contentType: 'image/png'
            });

        }

        if (ext === 'svg') {

            return Optional.of({
                cacheControl: PUBLIC_MAX_AGE_1WEEK,
                contentType: 'image/svg'
            });

        }

        // the fall through of cached data should work for PHZ files and other
        // types of binary data.

        return Optional.of({
            cacheControl: PUBLIC_MAX_AGE_1WEEK,
            contentType: 'application/octet-stream'
        });

    }

    /**
     * Wait for the record to be fully committed to the remote datastore - not
     * just written to the local cache.
     */
    private waitForCommit(ref: firebase.firestore.DocumentReference): Promise<void> {

        return new Promise(resolve => {

            const unsubscribeToSnapshot = ref.onSnapshot({includeMetadataChanges: true}, snapshot => {

                if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
                    unsubscribeToSnapshot();
                    resolve();
                }

            });

        });

    }

    private handleDatastoreMutations(ref: firebase.firestore.DocumentReference,
                                     datastoreMutation: DatastoreMutation<boolean>,
                                     op: 'write' | 'delete') {

        const unsubscribeToSnapshot = ref.onSnapshot({includeMetadataChanges: true}, snapshot => {

            if (snapshot.metadata.fromCache && snapshot.metadata.hasPendingWrites) {
                datastoreMutation.written.resolve(true);
                log.debug(`Got written mutation with op: ${op}`, ref);

            }

            if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {

                // it's been committed remotely which also implies it was
                // written locally so resolve that as well. We might not always
                // get the locally written callback and I think this happens
                // when the cache entry can't be updated due to it already being
                // pending.

                datastoreMutation.written.resolve(true);
                datastoreMutation.committed.resolve(true);
                log.debug(`Got committed mutation with op: ${op}`, ref);

                // not interested in snapshots from this document any more.
                unsubscribeToSnapshot();

            }

        });

    }

    /**
     * Called when new data is available from Firebase so we can solve promises,
     * add things to local stores, etc.
     *
     * ALL operations are done via snapshots which we create and subscribe to
     * on init().
     *
     * This solves to problems:
     *
     * 1. The most important, is that when data is added remotely (the user is
     *    on another machine and this machine-rejoins the network or detects
     *    changes) then content if pulled locally and added to the local
     *    datastore.
     *
     * 2. Local data is added via the same code path.  The code path is remote-
     *    first but then then immediately resolved from the cache and added
     *    locally.
     */
    private handleDocInfoSnapshot(snapshot: firebase.firestore.QuerySnapshot,
                                  docMetaSnapshotEventListener: DocMetaSnapshotEventListener,
                                  batchID: number) {

        log.debug("onSnapshot... ");

        type DocMetaData = string | null;

        interface DocMetaLookup {
            get(fingerprint: string): Promise<DocMetaData>;

            // [fingerprint: string]: DocMetaData;
        }

        /**
         * Local cache for storing DocMeta that we haven't fetched yet.
         */
        interface DocMetaCache {
            [fingerprint: string]: DocMetaData;
        }

        const datastore = this;

        class DefaultDocMetaLookup implements DocMetaLookup {

            constructor(private readonly cache: DocMetaCache) {

            }

            public async get(fingerprint: string): Promise<DocMetaData> {

                const result = this.cache[fingerprint];

                if (isPresent(result)) {
                    return result;
                }

                // we don't have this in the local cache which we SHOULD but
                // dont' generate an error here.  We should force a fetch from
                // the server.

                log.warn("No entry for fingerprint (fetching directly from server): " + fingerprint);

                return await datastore.getDocMeta(fingerprint, {preferredSource: 'server'});

            }

        }

        // TODO: we should shave ANOTHER 500ms by hinting that this page will
        // need BOTH the doc_meta and doc_info data (I think) by loading them
        // both at the same time (in parallel via Promises.all)
        const createDocMetaLookup = async (useCache: boolean): Promise<DocMetaLookup> => {

            const uid = FirebaseDatastore.getUserID();

            const query = this.firestore!
                .collection(DatastoreCollection.DOC_META)
                .where('uid', '==', uid);

            const source = useCache ? 'cache' : 'server';

            const stopwatch = Stopwatches.create();
            const snapshot = await query.get({source});
            log.info("DocMeta lookup snapshot duration: ", stopwatch.stop());

            const docChanges = snapshot.docChanges();

            const cache: DocMetaCache = {};

            // TODO: if we did a lookup by ID and not by fingerprint we could
            // probably keep the data JUST within localStorage until it's
            // requested to avoid keeping it in this in-memory map which could
            // help with memory pressure but we should wait until this is a
            // problem as it's a premature optimization right now.

            for (const docChange of docChanges) {
                const record = <RecordHolder<DocMetaHolder>> docChange.doc.data();
                const fingerprint = record.value.docInfo.fingerprint;
                const data = record.value.value;
                cache[fingerprint] = data;
            }

            return new DefaultDocMetaLookup(cache);

        };

        const docMetaLookupProvider =
            AsyncProviders.memoize(() => createDocMetaLookup(snapshot.metadata.fromCache));

        const docMetaMutationFromRecord = (record: RecordHolder<DocInfo>,
                                           mutationType: MutationType = 'created') => {

            const id = record.id;

            const docInfo = record.value;

            const dataProvider = async () => {
                const docMetaLookup = await docMetaLookupProvider();
                return docMetaLookup.get(docInfo.fingerprint);
            };

            const docMetaProvider = AsyncProviders.memoize(async () => {

                if (mutationType === 'deleted') {
                    throw new Error("Unable to read data when mutationType is 'deleted'");
                }

                const data = await dataProvider();
                const docMetaID = FirebaseDatastore.computeDocMetaID(docInfo.fingerprint);
                Preconditions.assertPresent(data, `No data for docMeta with fingerprint: ${docInfo.fingerprint}, docMetaID: ${docMetaID}`);
                return DocMetas.deserialize(data!, docInfo.fingerprint);
            });

            const docMetaMutation: FirebaseDocMetaMutation = {
                id,
                fingerprint: docInfo.fingerprint,
                dataProvider,
                docMetaProvider,
                docInfoProvider: AsyncProviders.of(docInfo),
                docMetaFileRefProvider: AsyncProviders.of(DocMetaFileRefs.createFromDocInfo(docInfo)),
                mutationType
            };

            return docMetaMutation;

        };

        const docMetaMutationFromDocChange = (docChange: firebase.firestore.DocumentChange) => {
            const record = <RecordHolder<DocInfo>> docChange.doc.data();
            return docMetaMutationFromRecord(record, toMutationType(docChange.type));

        };

        const docMetaMutationFromDoc = (doc: firebase.firestore.DocumentData) => {
            const record = <RecordHolder<DocInfo>> doc;
            return docMetaMutationFromRecord(record, 'created');

        };

        const handleDocMetaMutation = async (docMetaMutation: DocMetaMutation) => {

            // dispatch a progress event so we can detect how far we've been
            // loading
            await docMetaSnapshotEventListener({
                datastore: this.id,
                consistency,
                progress: progressTracker.incr(),
                docMetaMutations: [docMetaMutation],
                batch: {
                    id: batchID,
                    terminated: false,
                }
            });

        };

        const handleDocChange = (docChange: firebase.firestore.DocumentChange) => {
            const docMetaMutation = docMetaMutationFromDocChange(docChange);
            handleDocMetaMutation(docMetaMutation)
                .catch(err => log.error(err));

        };

        const handleDoc = (doc: firebase.firestore.QueryDocumentSnapshot) => {
            const docMetaMutation = docMetaMutationFromDoc(doc.data());
            handleDocMetaMutation(docMetaMutation)
                .catch(err => log.error(err));

        };

        const consistency = snapshot.metadata.fromCache ? 'written' : 'committed';

        const docChanges = snapshot.docChanges();

        const nrDocChanges = docChanges.length;
        const nrDocs = snapshot.docs.length;

        // log.notice(`GOT SNAPSHOT with consistency ${consistency}, nrDocs:
        // ${nrDocs}, nrDocChanges: ${nrDocChanges}`);

        // if (docChanges.length === 0) {
        //     log.notice("SKIPPING SNAPSHOT (no docChanges)");
        // }

        const progressTracker = new ProgressTracker(docChanges.length, 'firebase-snapshot');

        for (const docChange of docChanges) {

            handleDocChange(docChange);

        }

        // progressTracker = new ProgressTracker(snapshot.docs.length);
        //
        // for (const doc of snapshot.docs) {
        //     handleDoc(doc);
        // }

        docMetaSnapshotEventListener({
            datastore: this.id,
            consistency,
            progress: progressTracker.terminate(),
            docMetaMutations: [],
            batch: {
                id: batchID,
                terminated: true,
            }
        }).catch(err => log.error("Unable to dispatch event listener: ", err));

        log.debug("onSnapshot... done");

    }

    private toConsistency(snapshot: firebase.firestore.QuerySnapshot): DatastoreConsistency {
        return snapshot.metadata.fromCache ? 'written' : 'committed';
    }

    public static computeDocMetaID(fingerprint: string,
                                   uid: UserID = FirebaseDatastore.getUserID()): FirebaseDocMetaID {

        return Hashcodes.createID(uid + ':' + fingerprint, 32);

    }

    // You can allow users to sign in to your app using multiple authentication
    // providers by linking auth provider credentials to an existing user account.
    // Users are identifiable by the same Firebase user ID regardless of the
    // authentication provider they used to sign in. For example, a user who signed
    // in with a password can link a Google account and sign in with either method
    // in the future. Or, an anonymous user can link a Facebook account and then,
    // later, sign in with Facebook to continue using your app.

    public static getUserID(): UserID {

        const app = firebase.app();

        const auth = app.auth();
        Preconditions.assertPresent(auth, "Not authenticated");

        const user = auth.currentUser;
        Preconditions.assertPresent(user, "Not authenticated");

        return user!.uid;

    }

    public addDocMetaSnapshotEventListener(docMetaSnapshotEventListener: DocMetaSnapshotEventListener): void {
        this.docMetaSnapshotEventDispatcher.addEventListener(docMetaSnapshotEventListener);
    }

    private preferredSource(): FirestoreSource {

        if (AppRuntime.isBrowser()) {
            return 'cache';
        } else {
            return 'default';
        }

    }

}

type FirestoreSource = 'default' | 'server' | 'cache';

/**
 * Holds a data object literal by value. This contains the high level
 * information about a document including the ID and the visibility.  The value
 * object points to a more specific object which hold the actual data we need.
 */
export interface RecordHolder<T> {

    // the owner of this record.
    readonly uid: UserID;

    // the visibilty of this record.
    readonly visibility: Visibility;

    readonly id: string;

    readonly value: T;

}

export interface DocMetaHolder {

    // expose the high level DocInfo on this object which allows us to search by
    // URL, tags, etc.
    readonly docInfo: IDocInfo;

    readonly value: string;

}

export enum DatastoreCollection {

    DOC_INFO = "doc_info",

    DOC_META = "doc_meta",

}


/**
 * The result of a FB database mutation.
 */
interface Mutation {

}

interface PendingMutationIndex {
    [id: string]: PendingMutation;
}

interface PendingMutation {

    id: string;
    type: 'delete' | 'write';

}

interface FirebaseDocMetaMutation extends DocMetaMutation {
    readonly id: string;
}

/**
 * Convert a Firestore DocumentChangeType to a DocMutationType.  We prefer the
 * CRUD (create update delete) naming.
 */
function toMutationType(docChangeType: firebase.firestore.DocumentChangeType): MutationType {

    switch (docChangeType) {

        case 'added':
            return 'created';

        case 'modified':
            return 'updated';

        case 'removed':
            return 'deleted';

    }

}

interface StoragePath {
    readonly path: string;
    readonly settings?: StorageSettings;
}

interface StorageSettings {
    readonly cacheControl: string;
    readonly contentType: string;
}

/**
 * A specific type of document ID derived from the fingerprint and only
 * available within Firebase.
 */
export type FirebaseDocMetaID = string;

export class DownloadURLs {

    /**
     * Use the old getDownloadURL method which is not fast nor reliable.
     */
    private static USE_STORAGE_REF = false;

    public static async computeDownloadURL(backend: Backend,
                                           ref: FileRef,
                                           storagePath: StoragePath,
                                           storageRef: firebase.storage.Reference,
                                           opts: GetFileOpts): Promise<string | undefined> {

        if (this.USE_STORAGE_REF) {
            return this.computeDownloadURLWithStorageRef(storageRef);
        } else {
            return this.computeDownloadURLDirectly(backend, ref, storagePath, opts);
        }

    }

    private static async computeDownloadURLWithStorageRef(storageRef: firebase.storage.Reference): Promise<string | undefined> {

        try {

            return await storageRef.getDownloadURL();

        } catch (e) {

            if (e.code === "storage/object-not-found") {
                return undefined;
            }

            // some other type of exception ias occurred
            throw e;

        }

    }

    private static async computeDownloadURLDirectly(backend: Backend,
                                                    ref: FileRef,
                                                    storagePath: StoragePath,
                                                    opts: GetFileOpts): Promise<string | undefined> {

        /**
         * Compute the storage path including the flip over whether we're
         * going to be public without any type of path conversion depending
         * on whether it's public or not.  Public URLs have a 1:1 mapping
         * where everything else might be in a different bucket or path
         * depending the storage computation function.
         */
        const toPath = (): string => {

            if (backend === Backend.PUBLIC) {
                // there is no blinding of the data path with the users
                // user ID or other key.
                return `${backend}/${ref.name}`;
            } else {
                return storagePath.path;
            }

        };

        const toURL = (): string => {

            const path = toPath();

            return `https://storage.googleapis.com/polar-32b0f.appspot.com/${path}`;

        };

        const url = toURL();

        if (opts.noExistenceCheck) {

            // This is pretty darn slow when using HEAD but with GET and a range
            // query the performance isn't too bad.  Performing the HEAD directly
            // is really poor with 300-7500ms latencies.  There are some major
            // outliers when performing HEAD.
            //
            // Using GET and range of 0-0 is actually consistently about 200ms
            // which is pretty reasonable but we stills should have the option
            // to skip the exists check to just compute the URL.
            //
            // Doing an exists() with the Cloud SDK is about 250ms too.

            return url;

        } else {
            const exists = await URLs.existsWithGETUsingRange(url);

            return exists ? url : undefined;

        }

    }
}

interface GetDocMetaOpts {

    readonly preferredSource?: FirestoreSource;

}
