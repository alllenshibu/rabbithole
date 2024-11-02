import * as path from 'path';
import * as ts from 'typescript';

export interface Dependencies {
    name: string;
    path: string;
    dependencies?: Dependencies[];
}

export class Analyzer {
    private files: string[];
    private program: ts.Program;

    constructor(files: string[]) {
        this.files = files;
        const transpileOptions = {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
        };
        this.program = ts.createProgram(this.files, transpileOptions);
    }

    createDependencyAnalysis() {
        let deps: Dependencies[] = [];
        let sourceFiles: readonly ts.SourceFile[] = this.program.getSourceFiles();

        sourceFiles.forEach((file: ts.SourceFile) => {
            let filePath = path.resolve(file.fileName);

            if (!this.files.map(f => path.resolve(f)).includes(filePath)) {
                return;
            }

            console.log('file', filePath);
            deps = this.getDependencies(file);
        });

        return deps;
    }

    getDependencies(sourceFile: ts.SourceFile) {
        let deps: Dependencies[] = [];
        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {

                // console.log(node.getText(sourceFile));

                let moduleName = 'default';
                const modulePath = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
                const resolvedPath = this.resolveModulePath(sourceFile.fileName, modulePath);


                if (!modulePath.startsWith('./') && !modulePath.startsWith('../')) {
                    // console.log({t1: !modulePath.startsWith('./'), t2: !modulePath.startsWith('../')});
                    // console.log({moduleName, modulePath});
                    // deps.push({
                    //     name: moduleName,
                    //     path: resolvedPath,
                    // });
                    return;
                }

                if (resolvedPath.includes('node_modules')) {
                    // console.log('ignoring', modulePath)
                    // deps.push({
                    //     name: moduleName,
                    //     path: resolvedPath,
                    // });
                    return;
                }

                if (node.importClause) {
                    if (ts.isImportClause(node.importClause)) {
                        if (node.importClause.namedBindings) {
                            if (ts.isNamedImports(node.importClause.namedBindings)) {
                                moduleName = node.importClause.namedBindings.elements
                                    .map(element => element.name.getText(sourceFile))
                                    .join(', ');
                            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                                moduleName = `* as ${node.importClause.namedBindings.name.getText(sourceFile)}`;
                            }
                        } else if (node.importClause.name) {
                            moduleName = node.importClause.name.getText(sourceFile);
                        }
                    }
                }


                // console.log({moduleName, resolvedPath});

                const childSourceFiles = this.getChildSourceFiles(resolvedPath);

                let childDeps: Dependencies[] = [];
                childSourceFiles.forEach((childSourceFile) => {
                    // console.log('Going in', childSourceFile.fileName)
                    let d: Dependencies[] = this.getDependencies(childSourceFile);
                    childDeps.push(...d);
                });

                deps.push({
                    name: moduleName,
                    path: resolvedPath,
                    dependencies: childDeps.length > 0 ? childDeps : undefined,
                });
            }
        });

        return deps;
    }

    private resolveModulePath(sourceFilePath: string, modulePath: string): string {
        if (modulePath.startsWith('.')) {
            const resolvedPath = path.resolve(path.dirname(sourceFilePath), modulePath);
            return resolvedPath.endsWith('.ts') ? resolvedPath : `${resolvedPath}.ts`;
        }
        return modulePath.endsWith('.ts') ? modulePath : `${modulePath}.ts`;
    }

    private getChildSourceFiles(modulePath: string): readonly ts.SourceFile[] {
        const resolvedPath = path.resolve(modulePath);
        const childProgram = ts.createProgram([resolvedPath], {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        });
        return childProgram.getSourceFiles();
    }
}
