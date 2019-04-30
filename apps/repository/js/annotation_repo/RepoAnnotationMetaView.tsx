import * as React from 'react';
import {DocRepoTableColumns} from '../doc_repo/DocRepoTableColumns';
import {PersistenceLayerManager} from '../../../../web/js/datastore/PersistenceLayerManager';
import {IDocInfo} from '../../../../web/js/metadata/DocInfo';
import {RepoAnnotation} from '../RepoAnnotation';
import {IStyleMap} from '../../../../web/js/react/IStyleMap';
import Moment from 'react-moment';
import {FormattedTags} from '../FormattedTags';
import {Logger} from '../../../../web/js/logger/Logger';
import {SynchronizingDocLoader} from '../util/SynchronizingDocLoader';
import Button from 'reactstrap/lib/Button';
import {Datastores} from '../../../../web/js/datastore/Datastores';
import {Either} from '../../../../web/js/util/Either';

const log = Logger.create();

const Styles: IStyleMap = {

    metaTable: {
        display: 'table'
    },

    metaTableRow: {
        display: 'table-row'
    },

    metaField: {
        display: 'table-cell',
        // fontWeight: 'bold',
        color: 'var(--secondary)',
        marginRight: '10px',
        verticalAlign: 'top'
    },

    metaValue: {
        paddingLeft: '5px',
        display: 'table-cell',
        verticalAlign: 'top'
    },

    annotationText: {
        paddingTop: '5px'
    },

    relativeTime: {
        marginLeft: '5px',
        color: 'var(--secondary)',
        display: 'inline'
    }

};

export class RepoAnnotationMetaView extends React.Component<IProps, IState> {

    private readonly synchronizingDocLoader: SynchronizingDocLoader;

    constructor(props: IProps, context: any) {
        super(props, context);

        this.synchronizingDocLoader = new SynchronizingDocLoader(this.props.persistenceLayerManager);

        this.state = {
            data: [],
            columns: new DocRepoTableColumns()
        };

    }

    public render() {

        if (this.props.repoAnnotation) {

            const repoAnnotation = this.props.repoAnnotation;

            return (

                <div>

                    <div style={Styles.metaTable}>

                        <div style={Styles.metaTableRow}>
                            <div style={Styles.metaField}>Created</div>

                            <div style={Styles.metaValue}>

                                <Moment withTitle={true}
                                        titleFormat="D MMM YYYY hh:MM A"
                                        format="MMM DD YYYY HH:mm A"
                                        filter={(value) => value.replace(/^an? /g, '1 ')}>
                                    {repoAnnotation.created}
                                </Moment>

                                <div style={Styles.relativeTime}>

                                    (

                                    <Moment withTitle={true}
                                            titleFormat="D MMM YYYY hh:MM A"
                                            fromNow>
                                        {repoAnnotation.created}
                                    </Moment>

                                    )

                                </div>

                            </div>

                        </div>

                        <div style={Styles.metaTableRow}>

                            <div style={Styles.metaField}>Tags</div>

                            <div style={Styles.metaValue}>

                                <FormattedTags tags={repoAnnotation.tags || {}}/>

                            </div>

                        </div>

                        <div style={Styles.metaTableRow}>

                            <div style={Styles.metaField}>Type</div>

                            <div style={Styles.metaValue}>

                                {repoAnnotation.type}

                            </div>

                        </div>

                        <div style={Styles.metaTableRow}>

                            <div style={Styles.metaField}>Doc</div>

                            <div style={Styles.metaValue}>

                                {/*TODO: make this into a TextLink component*/}

                                <Button onClick={() => this.onDocumentLoadRequested(repoAnnotation.docInfo)}
                                        style={{whiteSpace: 'normal', textAlign: 'left'}}
                                        className="p-0"
                                        size="sm"
                                        color="link">

                                    {repoAnnotation.docInfo.title}

                                </Button>

                            </div>

                        </div>

                    </div>

                    <div style={Styles.annotationText}>
                        {repoAnnotation.text}
                    </div>

                </div>

            );

        } else {

            return (

                <div className="text-muted text-center">
                    No annotation selected.
                </div>

            );

        }

    }

    private onDocumentLoadRequested(docInfo: IDocInfo) {

        const backendFileRef = Datastores.toBackendFileRef(Either.ofRight(docInfo));

        this.synchronizingDocLoader.load(docInfo.fingerprint, backendFileRef!)
            .catch(err => log.error("Unable to load doc: ", err));

    }

}

export interface IProps {

    readonly persistenceLayerManager: PersistenceLayerManager;
    readonly repoAnnotation?: RepoAnnotation;
}

export interface IState {

}

