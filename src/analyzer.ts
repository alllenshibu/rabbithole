import * as path from 'path';
import * as ts from 'typescript';

export interface Dependencies {
    name: string;
    path: string;
    dependencies?: Dependencies[];
}

export class Analyzer {
    private files: string[];
    private projectRoot: string;
    private allowedPathAliases: Map<string, string> = new Map();
    private program: ts.Program;

    constructor(files: string[], projectRoot: string, allowedPathAliases: Record<string, string[]>) {
        this.files = files;
        this.projectRoot = projectRoot;

        for (const [alias, paths] of Object.entries(allowedPathAliases)) {
            if (paths.length > 0) {
                this.allowedPathAliases.set(alias, paths[0]);
            }
        }

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
                let resolvedPath = this.resolveModulePath(sourceFile.fileName, modulePath);

                if (!resolvedPath) return;

                // console.log(resolvedPath)

                if (node?.importClause?.namedBindings) {
                    if (ts.isNamedImports(node.importClause.namedBindings)) {
                        moduleName = node.importClause.namedBindings.elements
                            .map(element => element.name.getText(sourceFile))
                            .join(', ');
                    } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        moduleName = `* as ${node.importClause.namedBindings.name.getText(sourceFile)}`;
                    }
                } else if (node?.importClause?.name) {
                    moduleName = node.importClause.name.getText(sourceFile);
                }

                const childSourceFiles = this.getChildSourceFiles(resolvedPath);

                let childDeps: Dependencies[] = [];
                childSourceFiles.forEach((childSourceFile) => {
                    if (childSourceFile.fileName.includes("node_modules")) return;

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

    private resolveModulePath(sourceFilePath: string, modulePath: string): string | null {
        let resolvedPath: string = ''
        if (modulePath.startsWith('.')) {
            resolvedPath = path.resolve(path.dirname(sourceFilePath), modulePath);
        }

        const aliasMatch = [...this.allowedPathAliases.entries()].find(([alias]) =>
            modulePath.startsWith(alias));

        if (aliasMatch) {
            const [alias, replacement] = aliasMatch;
            resolvedPath = modulePath.replace(alias, replacement);
            resolvedPath = path.resolve(this.projectRoot, resolvedPath);
        }

        if (resolvedPath === '') return null;

        if (resolvedPath.includes('node_modules')) return null

        resolvedPath = resolvedPath.endsWith('.ts') ? resolvedPath : `${resolvedPath}.ts`;

        return resolvedPath
    }

    private getChildSourceFiles(resolvedPath: string): readonly ts.SourceFile[] {
        const childProgram = ts.createProgram([resolvedPath], {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        });
        return childProgram.getSourceFiles();
    }
}
