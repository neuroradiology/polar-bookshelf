import * as React from 'react';
import {Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Tooltip} from 'reactstrap';
import {ConfirmPopover} from '../../../web/js/ui/confirm/ConfirmPopover';
import {TextInputPopover} from '../../../web/js/ui/text_input/TextInputPopover';
import {Logger} from '../../../web/js/logger/Logger';
import {IStyleMap} from '../../../web/js/react/IStyleMap';
import {DocAnnotation} from './DocAnnotation';

const log = Logger.create();

class Styles {

    public static DropdownMenu: React.CSSProperties = {
        zIndex: 999,
        fontSize: '16px'
    };

    public static DropdownItem: React.CSSProperties = {
        fontSize: '15px'
    };

}

export class AnnotationDropdown extends React.Component<IProps, IState> {

    private open: boolean = false;
    private selected: SelectedOption = 'none';

    constructor(props: IProps, context: any) {
        super(props, context);

        this.toggle = this.toggle.bind(this);
        this.select = this.select.bind(this);
        this.onDelete = this.onDelete.bind(this);

        this.onCreateComment = this.onCreateComment.bind(this);
        this.onCreateFlashcard = this.onCreateFlashcard.bind(this);
        this.onJumpToContext = this.onJumpToContext.bind(this);

        this.state = {
            open: this.open,
            selected: this.selected,
        };

    }

    public render() {

        const toggleID = this.props.id + '-dropdown-toggle';

        return (

            <div className="text-right">

                <Dropdown id={this.props.id}
                          isOpen={this.state.open}
                          toggle={this.toggle}>

                    <DropdownToggle color="light"
                                    disabled={this.props.disabled}
                                    className="doc-dropdown-button btn text-muted pl-1 pr-1"
                                    id={toggleID}>

                        <i className="fas fa-ellipsis-h"></i>

                    </DropdownToggle>

                    <DropdownMenu right>

                        <DropdownItem style={Styles.DropdownItem} onClick={() => this.onCreateComment()}>
                            Create comment
                        </DropdownItem>

                        <DropdownItem style={Styles.DropdownItem} onClick={() => this.onCreateFlashcard()}>
                            Create flashcard
                        </DropdownItem>

                        <DropdownItem style={Styles.DropdownItem} onClick={() => this.onJumpToContext()}>
                            Jump to context
                        </DropdownItem>

                        <DropdownItem divider />

                        <DropdownItem style={Styles.DropdownItem} className="text-danger" onClick={() => this.onDeleteSelected()}>
                            Delete
                        </DropdownItem>

                    </DropdownMenu>


                </Dropdown>

                <ConfirmPopover open={this.state.selected === 'delete'}
                                target={toggleID}
                                title="Are you sure you want to delete this annotation? "
                                subtitle="This will also delete all associated comments and flashcards."
                                onCancel={() => this.select('none')}
                                onConfirm={() => this.onDelete()}/>

            </div>

        );

    }

    private onDeleteSelected() {
        this.select('delete');
    }

    private onCreateComment() {
        this.select('none');
        this.props.onCreateComment(this.props.annotation);
    }

    private onCreateFlashcard() {
        this.select('none');
        this.props.onCreateFlashcard(this.props.annotation);
    }

    private onJumpToContext() {
        this.select('none');
        this.props.onJumpToContext(this.props.annotation);
    }

    private onDelete() {
        this.select('none');
        this.props.onDelete(this.props.annotation);
    }

    private toggle() {

        this.open = ! this.state.open;

        this.refresh();

    }

    private select(selected: SelectedOption) {
        this.selected = selected;
        this.refresh();
    }

    private refresh() {

        this.setState({
          open: this.open,
          selected: this.selected
      });

    }

}

interface IProps {
    readonly id: string;
    readonly annotation: DocAnnotation;
    readonly onDelete: (annotation: DocAnnotation) => void;
    readonly onJumpToContext: (annotation: DocAnnotation) => void;
    readonly onCreateComment: (annotation: DocAnnotation) => void;
    readonly onCreateFlashcard: (annotation: DocAnnotation) => void;
    readonly disabled?: boolean;
}

interface IState {

    open: boolean;
    selected: SelectedOption;

}

type SelectedOption = 'delete' | 'none';

