/* eslint react/no-multi-comp: 0, react/prop-types: 0 */
import React from 'react';
import {Feedback} from '../../../../../web/js/ui/feedback/Feedback';
import {Rating} from '../../../../../web/js/ui/feedback/Feedback';
import {Toaster} from '../../../../../web/js/ui/toaster/Toaster';
import {UserFeedbacks} from '../../../../../web/js/customers/UserFeedback';
import {MachineIDs} from '../../../../../web/js/util/MachineIDs';
import {ISODateTimeStrings} from '../../../../../web/js/metadata/ISODateTimeStrings';

export class NPSModal extends React.Component<IProps, IState> {

    constructor(props: IProps) {
        super(props);
        this.onRated = this.onRated.bind(this);
    }

    public render() {

        return (

            <Feedback category='net-promoter-score'
                      title='How likely are you to recommend Polar?'
                      from="Not likely"
                      to="Very likely"
                      onRated={(rating) => this.onRated(rating)}/>

        );
    }

    private onRated(rating: Rating) {

        Toaster.success("Thanks for your feedback!");

        const userFeedback = {
            machine: MachineIDs.get(),
            text: null,
            netPromoterScore: rating,
            created: ISODateTimeStrings.create()
        };

        UserFeedbacks.write(userFeedback)
            .catch(err => console.error("Unable to write user feedback: ", err));

    }
}

interface IProps {
}

interface IState {
}

