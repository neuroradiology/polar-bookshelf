import {FileRef} from './Datastore';
import {DeleteResult} from './Datastore';
import {GetFileOpts} from './Datastore';
import {ErrorListener} from './Datastore';
import {DatastoreInitOpts} from './Datastore';
import {BinaryFileData} from './Datastore';
import {WriteFileOpts} from './Datastore';
import {DatastoreOverview} from './Datastore';
import {Datastore} from './Datastore';
import {DatastoreID} from './Datastore';
import {InitResult} from './Datastore';
import {Backend} from './Backend';
import {DocMetaFileRef} from './DocMetaRef';
import {DocMetaRef} from './DocMetaRef';
import {DatastoreMutation} from './DatastoreMutation';
import {DocMeta} from '../metadata/DocMeta';
import {Optional} from '../util/ts/Optional';
import {DocFileMeta} from './DocFileMeta';
import {WriteOpts} from './Datastore';
import {DocInfo} from '../metadata/DocInfo';
import {IDocInfo} from '../metadata/DocInfo';
import {RendererAnalytics} from '../ga/RendererAnalytics';
import {DelegatedDatastore} from './DelegatedDatastore';

const tracer = RendererAnalytics.createTracer('datastore');

/**
 * A PersistenceLayer that traces potentially slow operations so we can
 * analyze performance at runtime and try to keep optimizing the high level
 * operations.
 */
export class TracedDatastore extends DelegatedDatastore {

    constructor(public readonly delegate: Datastore,
                public readonly id: DatastoreID = 'traced') {

        super(delegate);
    }

    public async contains(fingerprint: string): Promise<boolean> {
        return tracer.traceAsync('contains', () => this.delegate.contains(fingerprint));
    }

    public async containsFile(backend: Backend, ref: FileRef): Promise<boolean> {
        return tracer.traceAsync('containsFile', () => this.delegate.containsFile(backend, ref));
    }

    public async createBackup(): Promise<void> {
        return tracer.traceAsync('createBackup', () => this.delegate.createBackup());
    }

    public async deactivate(): Promise<void> {
        return tracer.traceAsync('deactivate', () => this.delegate.deactivate());
    }

    public async delete(docMetaFileRef: DocMetaFileRef, datastoreMutation?: DatastoreMutation<boolean>): Promise<Readonly<DeleteResult>> {
        return tracer.traceAsync('delete', () => this.delegate.delete(docMetaFileRef, datastoreMutation));
    }

    public async deleteFile(backend: Backend, ref: FileRef): Promise<void> {
        return tracer.traceAsync('deleteFile', () => this.delegate.deleteFile(backend, ref));
    }

    public async getDocMeta(fingerprint: string): Promise<string | null> {
        return tracer.traceAsync('getDocMeta', () => this.delegate.getDocMeta(fingerprint));
    }

    public async getDocMetaRefs(): Promise<DocMetaRef[]> {
        return tracer.traceAsync('getDocMetaRefs', () => this.delegate.getDocMetaRefs());
    }

    public async getFile(backend: Backend, ref: FileRef, opts?: GetFileOpts): Promise<Optional<DocFileMeta>> {
        return tracer.traceAsync('getFile', () => this.delegate.getFile(backend, ref, opts));
    }

    public async init(errorListener?: ErrorListener, opts?: DatastoreInitOpts): Promise<InitResult> {
        return tracer.traceAsync('init', () => this.delegate.init(errorListener, opts));
    }

    public async overview(): Promise<DatastoreOverview | undefined> {
        return tracer.traceAsync('overview', () => this.delegate.overview());
    }

    public async synchronizeDocs(...docMetaRefs: DocMetaRef[]): Promise<void> {
        return tracer.traceAsync('synchronizeDocs', () => this.delegate.synchronizeDocs(...docMetaRefs));
    }

    public async write(fingerprint: string, data: string, docInfo: IDocInfo, opts?: WriteOpts): Promise<void> {
        return tracer.traceAsync('write', () => this.delegate.write(fingerprint, data, docInfo, opts));
    }

    public async writeDocMeta(docMeta: DocMeta, datastoreMutation?: DatastoreMutation<DocInfo>): Promise<DocInfo> {
        return tracer.traceAsync('writeDocMeta', () => this.delegate.writeDocMeta(docMeta, datastoreMutation));
    }

    public async writeFile(backend: Backend, ref: FileRef, data: BinaryFileData, opts?: WriteFileOpts): Promise<DocFileMeta> {
        return tracer.traceAsync('writeFile', () => this.delegate.writeFile(backend, ref, data, opts));
    }

}
