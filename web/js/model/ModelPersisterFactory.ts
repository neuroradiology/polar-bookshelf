import {DocMeta} from '../metadata/DocMeta';
import {ModelPersister} from './ModelPersister';
import {PersistenceLayerHandler} from '../datastore/PersistenceLayerHandler';

export class ModelPersisterFactory {

    constructor(private readonly persistenceLayerHandler: PersistenceLayerHandler) {
    }

    /**
     * Initialize a new persistent Model.
     */
    public create(docMeta: DocMeta): ModelPersister {
        return new ModelPersister(this.persistenceLayerHandler, docMeta);
    }

}

