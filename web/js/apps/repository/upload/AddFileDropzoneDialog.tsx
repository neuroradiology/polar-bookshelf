import React from 'react';
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import { DropzoneArea } from 'material-ui-dropzone';
import {createStyles, makeStyles, Theme} from "@material-ui/core/styles";
import {DropEvent} from 'react-dropzone';
import {AddFileHooks} from "./AddFileHooks";
import useAddFileImporter = AddFileHooks.useAddFileImporter;

interface IProps {
    readonly open: boolean;
    readonly onClose: () => void;
}

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        textContainer: {
            margin: '5px 15px'
        }
    }),
);


export const AddFileDropzoneDialog = React.memo((props: IProps) => {

    const classes = useStyles();
    const addFileImporter = useAddFileImporter();

    function onDrop(files: File[], event: DropEvent) {
        props.onClose();
        addFileImporter(files);
    }

    return (
        <Dialog open={props.open}
                maxWidth="lg"
                onClose={props.onClose}>

            <DialogTitle>
                Upload PDF and EPUB Files
            </DialogTitle>
            <DialogContent>
                <div className="mt-2 mb-4">
                    <DropzoneArea
                        classes={classes}
                        dropzoneText="Drag and drop PDF or EPUB files to Upload"
                        showPreviews={false}
                        showPreviewsInDropzone={false}
                        onDrop={onDrop}
                        acceptedFiles={['application/pdf', 'application/epub+zip']}
                        maxFileSize={500000000}/>
                </div>
            </DialogContent>
        </Dialog>

    );

});
