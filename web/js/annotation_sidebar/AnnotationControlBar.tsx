import * as React from 'react';
import {DocAnnotation} from './DocAnnotation';
import {AnnotationSidebars} from './AnnotationSidebars';
import Moment from 'react-moment';
import {IStyleMap} from '../react/IStyleMap';
import {AnnotationDropdown} from './AnnotationDropdown';
import {AnnotationType} from '../metadata/AnnotationType';
import {Button} from 'reactstrap';
import {RendererAnalytics} from '../ga/RendererAnalytics';
import {CommentIcon} from '../ui/standard_icons/CommentIcon';
import {FlashcardIcon} from '../ui/standard_icons/FlashcardIcon';
import {FlashcardType} from '../metadata/FlashcardType';
import {ClozeFields, FrontAndBackFields} from './child_annotations/flashcards/flashcard_input/FlashcardInputs';
import {Comment} from "../metadata/Comment";
import {CreateComment} from "./child_annotations/comments/CreateComment";
import {CommentActions} from "./child_annotations/comments/CommentActions";
import {CreateFlashcard} from './child_annotations/flashcards/CreateFlashcard';
import {FlashcardActions} from './child_annotations/flashcards/FlashcardActions';
import {Doc} from '../metadata/Doc';

const Styles: IStyleMap = {

    button: {
        paddingTop: '4px',
        color: 'red !important',
        fontSize: '15px'

        // minWidth: '350px',
        // width: '350px'
    },

    barBody: {
        display: 'flex'
    },

    barChild: {
        marginTop: 'auto',
        marginBottom: 'auto',
    }

};

/**
 */
export class AnnotationControlBar extends React.Component<IProps, IState> {

    constructor(props: IProps, context: any) {
        super(props, context);

        this.onComment = this.onComment.bind(this);

        this.state = {
            activeInputComponent: 'none'
        };

    }

    public render() {
        const { annotation } = this.props;

        return (

            <div className="annotation-control-bar mb-3">

                <div style={Styles.barBody}
                     className="flexbar annotation-buttons border-bottom pt-0 pb-0">

                    <div style={Styles.barChild}
                         className="text-muted annotation-context-link">
                        {/*TODO: make this into its own component... */}
                        <a href="#" onClick={() => this.onJumpToContext(annotation)}>
                            <Moment withTitle={true} titleFormat="D MMM YYYY hh:MM A" fromNow>
                                {annotation.created}
                            </Moment>
                        </a>
                    </div>

                    <div style={Styles.barChild}
                         className="flexbar-right">

                        {/*TODO: make these a button with a 'light' color and size of 'sm'*/}

                        <Button className="text-muted p-1"
                                title="Create comment"
                                size="sm"
                                color="light"
                                style={Styles.button}
                                disabled={! this.props.doc.mutable}
                                onClick={() => this.toggleActiveInputComponent('comment')}>

                            <CommentIcon/>

                        </Button>

                        <Button className="ml-1 text-muted p-1"
                                title="Create flashcard"
                                style={Styles.button}
                                size="sm"
                                color="light"
                                disabled={! this.props.doc.mutable}
                                onClick={() => this.toggleActiveInputComponent('flashcard')}>

                            <FlashcardIcon/>

                        </Button>

                        <div className="ml-1">
                            <AnnotationDropdown id={'annotation-dropdown-' + annotation.id}
                                                disabled={! this.props.doc.mutable}
                                                annotation={annotation}
                                                onDelete={() => this.onDelete(annotation)}
                                                onCreateComment={() => this.toggleActiveInputComponent('comment')}
                                                onCreateFlashcard={() => this.toggleActiveInputComponent('flashcard')}
                                                onJumpToContext={() => this.onJumpToContext(annotation)}/>
                        </div>

                    </div>

                </div>

                <CreateComment id={annotation.id}
                               active={this.state.activeInputComponent === 'comment'}
                               onCancel={() => this.toggleActiveInputComponent('none')}
                               onComment={(html) => this.onComment(html)}/>

                <CreateFlashcard id={annotation.id}
                                 active={this.state.activeInputComponent === 'flashcard'}
                                 onCancel={() => this.toggleActiveInputComponent('none')}
                                 onFlashcardCreated={(type, fields) => this.onFlashcardCreated(type, fields)}/>

            </div>

        );
    }

    private onDelete(annotation: DocAnnotation) {

        if (annotation.annotationType === AnnotationType.TEXT_HIGHLIGHT) {
            delete annotation.pageMeta.textHighlights[annotation.id];
        }

        if (annotation.annotationType === AnnotationType.AREA_HIGHLIGHT) {
            delete annotation.pageMeta.areaHighlights[annotation.id];
        }

    }

    private onJumpToContext(annotation: DocAnnotation) {
        AnnotationSidebars.scrollToAnnotation(annotation.id, annotation.pageNum);
    }

    private toggleActiveInputComponent(activeInputComponent: ActiveInputComponent) {
        this.setState({
            activeInputComponent: this.state.activeInputComponent === activeInputComponent ? 'none' : activeInputComponent
        });
    }

    private onComment(html: string, existingComment?: Comment) {

        RendererAnalytics.event({category: 'annotations', action: 'comment-created'});

        // sanitize the HTML first to prevent breaking the DOM and other
        // problematic issues with HTML.  Right now we don't handle any type of
        // XSS though

        // TODO: right now it seems to strip important CSS styles and data URLs
        // which I need to fix in the HTML sanitizer.
        // html = HTMLSanitizer.sanitize(html);

        CommentActions.create(this.props.annotation, html);

        this.setState({
            activeInputComponent: 'none'
        });

    }

    private onFlashcardCreated(type: FlashcardType, fields: FrontAndBackFields | ClozeFields) {

        RendererAnalytics.event({category: 'annotations', action: 'flashcard-created'});

        FlashcardActions.create(this.props.annotation, type, fields);

        this.setState({
            activeInputComponent: 'none'
        });

    }

}
interface IProps {
    readonly doc: Doc;
    readonly annotation: DocAnnotation;
}

interface IState {
    activeInputComponent: ActiveInputComponent;
}

type ActiveInputComponent = 'none' | 'comment' | 'flashcard';
