import * as React from 'react';
import {BottomNavButton} from "./BottomNavButton";
import {DeviceRouter} from "../../../../web/js/ui/DeviceRouter";

/**
 * Simple header for the repository which supports arbitrary children.
 */
export class RepoFooter extends React.PureComponent<IProps> {

    public render() {

        const Delegate =
            <footer className="border-top">

                <div className=""
                     style={{
                         display: 'flex'
                     }}>

                    <BottomNavButton pathname="/" hash="#annotations" icon="fas fa-home"/>
                    <BottomNavButton pathname="/" hash="#stats" icon="fas fa-chart-line"/>

                </div>

            </footer>;

        return (

            <DeviceRouter phone={Delegate} tablet={Delegate}/>

        );

    }

}

interface IProps {
}