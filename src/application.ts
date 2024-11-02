import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import {program} from 'commander';
import {Analyzer, Dependencies} from "./analyzer";

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

            let deps: Dependencies[] = analyzer.createDependencyAnalysis()

            fs.writeFile(path.join(cwd, 'deps.json'), JSON.stringify(deps, null, 2), (err) => {
                if (err) {
                    console.error(err);
                    process.exit(1);
                } else {
                    console.log('Dependency analysis completed, file has been saved');
                }
            })

            // const printDependencyTree = (deps: Dependencies[], level: number = 0) => {
            //     deps.forEach((dep: Dependencies) => {
            //         for (let i = 0; i < level; i++)
            //             process.stdout.write('- ');
            //         console.log(`- ${dep.name} (${dep.path})`);
            //         if (dep.dependencies)
            //             printDependencyTree(dep.dependencies, level + 1);
            //     });
            // }

            // printDependencyTree(deps);

        } else {
            outputHelp();
        }
    };
}
