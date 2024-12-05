import * as fs from 'fs';
import * as path from 'path';
import {program} from 'commander';
import {Analyzer, Dependency} from "./analyzer";

const cwd = process.cwd();

program
    .option('-f, --file <file>', 'Entry *.ts file')
    .option('--tsconfig <tsconfig>', 'Path to tsconfig.json file')
    .option('--depth <depth>', 'Depth of dependency analysis')

program.parse(process.argv);

const outputHelp = () => {
    program.outputHelp();
    process.exit(0);
};

export namespace Application {
    export const run = () => {
        const options = program.opts();

        let file: string = ''
        let projectRoot: string = "";
        let depth: number = 1;
        let allowedPathAliases: Record<string, string[]> = {};

        if (options.file) {
            file = options.file;
            depth = options.depth ? parseInt(options.depth) : 1;

            if (options.tsconfig) {
                const tsconfig = JSON.parse(fs.readFileSync(options.tsconfig, 'utf8'));

                projectRoot = path.dirname(options.tsconfig);

                if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
                    allowedPathAliases = tsconfig.compilerOptions.paths;

                    for (let alias in allowedPathAliases) {
                        if (alias.endsWith("/*")) {
                            let paths: string[] = allowedPathAliases[alias];
                            alias = alias.slice(0, -2);
                            allowedPathAliases[alias] = paths;
                        }

                        if (allowedPathAliases[alias].length > 0) {
                            allowedPathAliases[alias] = allowedPathAliases[alias].map((path: string) => {
                                return path.endsWith("/*") ? path.slice(0, -2) : path;
                            });
                        }
                    }
                }
            }

            let analyzer: Analyzer = new Analyzer(file, projectRoot, allowedPathAliases, depth);

            let dependencyAnalysis: {
                name: string;
                path: string;
                dependencies: Dependency[];
            } = analyzer.createDependencyAnalysis();

            const mermaidGraph: string = convertToMermaidGraph(dependencyAnalysis);

            saveDependencyAnalysis(dependencyAnalysis, "deps.json");
            saveDependencyAnalysisGraph(mermaidGraph, "deps.html");

        } else {
            outputHelp();
        }
    };
    const convertToMermaidGraph = (dependencyAnalysis: {
        name: string;
        path: string;
        dependencies: Dependency[]
    }): string => {
        let mermaidGraph = "graph TD\n";

        const processNode =
            (node: Dependency, parentName: string | null = null): void => {
                if (!node.name)
                    return;

                const nodeName: string = node.name.replace(/\W/g, "_");

                mermaidGraph += `    ${nodeName}["${node.name}"]\n`;

                if (parentName) {
                    mermaidGraph += `    ${parentName} --> ${nodeName}\n`;
                }

                if (Array.isArray(node.dependencies)) {
                    node.dependencies.forEach((dependency: Dependency) => {
                        processNode(dependency, nodeName);
                    });
                }
            }

        processNode(dependencyAnalysis);

        return mermaidGraph;
    }

    const saveDependencyAnalysis = (dependencyAnalysis: {
        name: string;
        path: string;
        dependencies: Dependency[]
    }, outputPath: string): void => {
        fs.writeFile(path.join(cwd, outputPath), JSON.stringify(dependencyAnalysis, null, 2), (err) => {
            if (err) {
                console.error(err);
                process.exit(1);
            } else {
                console.log('Dependency analysis json file has been saved');
            }
        });
    }

    const saveDependencyAnalysisGraph = (mermaidGraph: string, outputPath: string): void => {
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid Graph</title>
    <script type="module" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"></script>
</head>
<body>
    <div class="mermaid">
${mermaidGraph}
    </div>
    <script>
        mermaid.initialize({ startOnLoad: true });
    </script>
</body>
</html>
`;

        fs.writeFileSync(outputPath, htmlContent, 'utf8');
        console.log(`Dependency analysis graph saved to ${outputPath}`);
    }
}
