import * as path from 'path';
import * as ts from 'typescript';

export interface Dependency {
    name: string;
    path: string;
    dependencies?: Dependency[];
}

export class Analyzer {
    private file: string;
    private projectRoot: string;
    private allowedPathAliases: Map<string, string> = new Map();
    private program: ts.Program;

    private moduleDependencies: Map<string, Dependency> = new Map()

    constructor(file: string, projectRoot: string, allowedPathAliases: Record<string, string[]>) {
        this.file = file;
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
        this.program = ts.createProgram([this.file], transpileOptions);
    }

    createDependencyAnalysis() {
        let deps: Dependency[] = [];
        let sourceFiles: readonly ts.SourceFile[] = this.program.getSourceFiles();

        const rootFileNamesWithModules = {
            name: path
                .basename(this.file)
                .replace(/\.[^/.]+$/, ''),
            path: path.resolve(this.file)
        };

        sourceFiles.forEach((file: ts.SourceFile) => {
            let filePath = path.resolve(file.fileName);

            // Skip non-root files
            if (!path.resolve(this.file).includes(filePath)) return

            console.log('Processing file:', filePath);
            deps.push(...this.getDependencies(file));
        });

        return {
            name: rootFileNamesWithModules.name,
            path: rootFileNamesWithModules.path,
            dependencies: deps
        };
    }

    private getDependencies(sourceFile: ts.SourceFile): Dependency[] {
        let deps: Dependency[] = [];

        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {

                let moduleNames: string[] = ['default'];
                const modulePath = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
                let resolvedPath = this.resolveModulePath(sourceFile.fileName, modulePath);

                if (!resolvedPath) return;

                if (node?.importClause?.namedBindings) {
                    if (ts.isNamedImports(node.importClause.namedBindings)) {
                        moduleNames = node.importClause.namedBindings.elements
                            .map(element => element.name.getText(sourceFile));
                    } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        moduleNames = [`* as ${node.importClause.namedBindings.name.getText(sourceFile)}`];
                    }
                } else if (node?.importClause?.name) {
                    moduleNames = [node.importClause.name.getText(sourceFile)];
                }

                if (this.moduleDependencies.has(resolvedPath)) {
                    const cachedDep = this.moduleDependencies.get(resolvedPath);
                    if (cachedDep) {
                        moduleNames.forEach(moduleName => {
                            deps.push({
                                name: moduleName,
                                path: cachedDep.path,
                                dependencies: cachedDep.dependencies,
                            });
                        });
                    }
                    return;
                }

                const childSourceFiles = this.getChildSourceFiles(resolvedPath);

                let childDeps: Dependency[] = [];
                childSourceFiles.forEach((childSourceFile) => {
                    if (childSourceFile.fileName.includes("node_modules")) return;

                    let d: Dependency[] = this.getDependencies(childSourceFile);
                    childDeps.push(...d);
                });

                const dep: Dependency = {
                    name: '',
                    path: resolvedPath,
                    dependencies: childDeps.length > 0 ? childDeps : undefined,
                };

                this.moduleDependencies.set(resolvedPath, dep);

                moduleNames.forEach((moduleName: string) => {
                    deps.push({
                        name: moduleName,
                        path: resolvedPath,
                        dependencies: childDeps.length > 0 ? childDeps : undefined,
                    });
                });
            }
        });

        return deps;
    }

    private resolveModulePath(sourceFilePath: string, modulePath: string): string | null {
        let resolvedPath: string = '';
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

        if (resolvedPath.includes('node_modules')) return null;

        resolvedPath = resolvedPath.endsWith('.ts') ? resolvedPath : `${resolvedPath}.ts`;

        return resolvedPath;
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
