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
            this.getDependencies(file, deps);
        });

        console.log('Final dependencies:', deps);
    }

    getDependencies(sourceFile: ts.SourceFile, deps: Dependencies[]) {
        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                let moduleName = 'default'; // Default module name if no imports found
                const modulePath = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, ''); // Remove quotes
                const resolvedPath = this.resolveModulePath(sourceFile.fileName, modulePath);


                if (!modulePath.startsWith('./') && !modulePath.startsWith('../') && !(modulePath == 'buffer' || modulePath === 'stream')) {
                    // If the module path does not start with './', skip recursive analysis
                    console.log({moduleName, modulePath});
                    deps.push({
                        name: moduleName,
                        path: modulePath,
                    });
                    return; // Skip further processing for this import declaration
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

                deps.push({
                    name: moduleName,
                    path: modulePath,
                });

                // Recursive dependency analysis only for local imports (starting with './')
                const childSourceFiles = this.getChildSourceFiles(resolvedPath);
                childSourceFiles.forEach((childSourceFile) => {
                    this.getDependencies(childSourceFile, deps);
                });
            }
        });
    }


    private getModulePath(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): string {
        return node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
    }

    private resolveModulePath(sourceFilePath: string, modulePath: string): string {
        if (modulePath.startsWith('.')) {
            return path.resolve(path.dirname(sourceFilePath), modulePath);
        }
        // Handle non-relative paths if needed (like node modules)
        return modulePath;
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
