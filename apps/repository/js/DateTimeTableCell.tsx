import * as React from 'react';
import {Logger} from '../../../web/js/logger/Logger';
import {isPresent} from '../../../web/js/Preconditions';
import Moment from 'react-moment';
import {ISODateTimeString} from '../../../web/js/metadata/ISODateTimeStrings';

const log = Logger.create();

export class DateTimeTableCell extends React.PureComponent<IProps, any> {

    constructor(props: IProps, context: any) {
        super(props, context);
    }

    public render() {

        if (isPresent(this.props.datetime)) {

            return (

                <div className={this.props.className}>
                    <Moment withTitle={true}
                            titleFormat="D MMM YYYY hh:MM A"
                            filter={(value) => value.replace(/^an? /g, '1 ')}
                            fromNow ago>
                        {this.props.datetime!}
                    </Moment>
                </div>

            );

        } else {
            return null;
        }

    }

}

interface IProps {
    datetime: ISODateTimeString | null | undefined;
    className: string;
}
