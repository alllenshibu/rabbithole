import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import {program} from 'commander';
import {Analyzer} from "./analyzer";

const cwd = process.cwd();

program
    .option('-f, --file <file>', 'Entry *.ts file');

program.parse(process.argv);

const outputHelp = () => {
    program.outputHelp();
    process.exit(0);
};

export namespace Application {
    export const run = () => {
        const options = program.opts();

        console.log("Arguments:", process.argv);

        let files = []

        if (options.file) {
            console.log(`File provided: ${options.file}`);

            files = [options.file];
            let analyzer: Analyzer = new Analyzer(files);

            analyzer.createDependencyAnalysis()

        } else {
            outputHelp();
        }
    };
}
