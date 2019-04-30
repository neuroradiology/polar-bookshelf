import * as React from 'react';
import {Button} from 'reactstrap';
import {HighlightColor} from '../../metadata/BaseHighlight';
import {IStyleMap} from '../../react/IStyleMap';
import {IconStyles} from './IconStyles';

/**
 */
export class EditIcon extends React.PureComponent<IProps, IState> {

    constructor(props: IProps, context: any) {
        super(props, context);
    }

    public render() {

        return (

            <i style={IconStyles.ICON} className="far fa-edit"></i>

        );

    }

}

interface IProps {
}

interface IState {
}
