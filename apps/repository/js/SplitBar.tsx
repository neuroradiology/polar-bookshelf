import * as React from 'react';
import {Logger} from '../../../web/js/logger/Logger';

const log = Logger.create();

export class SplitBar extends React.PureComponent<any, any> {

    constructor(props: any, context: any) {
        super(props, context);
    }

    public render() {

        return (

            <div className="split-bar pl-0 pr-0">

                <div style={{display: 'flex'}}>

                    {this.props.children}

                </div>

            </div>
        );
    }

}

export class SplitBarLeft extends React.PureComponent<any, any> {

    constructor(props: any, context: any) {
        super(props, context);
    }

    public render() {

        return (

            <div className="split-bar-left"
                 style={{marginTop: 'auto', marginBottom: 'auto', width: '250px', whiteSpace: 'nowrap'}}>

                {this.props.children}

            </div>

        );
    }

}

export class SplitBarRight extends React.PureComponent<any, any> {

    constructor(props: any, context: any) {
        super(props, context);
    }

    public render() {

        return (

            <div className="split-bar-right"
                 style={{marginTop: 'auto', marginBottom: 'auto', display: 'flex', justifyContent: 'flex-end', width: '100%'}}>

                {this.props.children}

            </div>

        );
    }

}
