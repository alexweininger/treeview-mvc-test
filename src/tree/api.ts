import { stringify } from 'querystring';
import * as vscode from 'vscode';
import { Event, EventEmitter, TreeItem } from 'vscode';
import { sleep } from '../utils/sleep';

interface TreeElementBase {
    id: string;
    service: Service;
};

interface InternalNode<T extends TreeElementBase> extends TreeElementBase {
    children: (InternalNode<T> | T)[];
    sortChildren?: (a: T, b: T) => number;
};

type TreeSkeleton<T extends TreeElementBase> = InternalNode<T>;

const tree: TreeSkeleton<ServiceTreeNode> = {
    id: 'root',
    service: 'staticWebApp',
    children: [
        {
            service: 'staticWebApp',
            id: 'resourceGroup/1',
            children: [
                { id: 'hello1', service: 'staticWebApp' },
                { id: 'hello2', service: 'staticWebApp' },
                { id: 'hello3', service: 'staticWebApp' }
            ]
        },
        { id: 'hello12', service: 'staticWebApp' },
        {
            service: 'staticWebApp',
            id: 'resourceGroup/2',
            children: [
                { id: 'hello4', service: 'staticWebApp' },
                { id: 'hello5', service: 'staticWebApp' },
                { id: 'hello6', service: 'staticWebApp' }
            ]
        },
        { id: 'hello14', service: 'staticWebApp' }
    ]
};

type BaseModel = {
    serviceId: string;
};

type ResourceTreeItemModel = {
    id: string;
    name: string;
    type: string;
} & BaseModel;

type ResolvedModel<T> = ResourceTreeItemModel & T;

type TreeItemModels<T> = Record<string, ResourceTreeItemModel | ResolvedModel<T>>;

type TreeItemFactory<M> = (model: M) => Promise<vscode.TreeItem>;
type ResolveModel<M> = (id: string) => Promise<M>;
interface TreeItemControllerBase<M> {
    [key: string]: ((model: M) => Promise<void>) | undefined;
}

interface RefreshableController<M> extends TreeItemControllerBase<M> {
    refresh?: (model: M) => Promise<void>;
}

interface DeletableController<M> extends TreeItemControllerBase<M> {
    refresh?: (model: M) => Promise<void>;
}

interface InternalAzExtTreeItem {
    parentId: string;
    id: string;
}

interface AzExtTreeItem {
    id: string;
}

interface ResourceTreeItem {
    id: string;
    resourceId: string;
    parentId: string;
}

interface ResolvableTreeItemService<Base extends BaseModel, Resolved, Controller extends TreeItemControllerBase<Resolved>, T extends TreeItem> {
    id: string;
    resolveModel(model: Base): Promise<Resolved>;
    createTreeItem(model: Base): T;
    createResolvedTreeItem(model: ResolvedModel<Resolved>): T;
    controller: Controller;
}

interface BaseStaticWebAppModel extends ResourceTreeItemModel {
    serviceId: 'staticWebApp';
    id: string;
}

interface ResolvedStaticWebAppModel {
    repositoryUrl: string;
    repoName: string;
}

abstract class CachableTreeItemService<Base extends BaseModel, Resolved, Controller extends TreeItemControllerBase<Resolved>, T extends TreeItem> implements ResolvableTreeItemService<Base, Resolved, Controller, T> {
    
    private readonly cache: ServiceCache<BaseStaticWebAppModel, ResolvedStaticWebAppModel> = new ServiceCache();

    abstract id: string;
    abstract controller: Controller;
    abstract resolveModel(model: Base): Promise<Resolved>;
    abstract createTreeItem(model: Base): T;
    abstract createResolvedTreeItem(model: ResolvedModel<Resolved>): T;
}

class StaticWebAppTreeItemService extends CachableTreeItemService<BaseStaticWebAppModel, ResolvedStaticWebAppModel, TreeItemControllerBase<ResolvedStaticWebAppModel>, TreeItem> {
    public readonly id: string = 'staticWebApp';

    public async resolveModel(model: BaseStaticWebAppModel): Promise<ResolvedStaticWebAppModel> {
        await sleep(800);
        return {
            repositoryUrl: 'https://github.com/alexweininger/react-basic.git',
            repoName: 'react-basic'
        };
    }

    public createTreeItem(model: BaseStaticWebAppModel): TreeItem {
        return {
            label: `Static Web App (${model.id})`,
        };
    }

    public createResolvedTreeItem(model: ResolvedModel<ResolvedStaticWebAppModel>): TreeItem {
        return {
            label: `resolved Static Web App (${model.id})`,
            description: model.repoName
        };
    }

    public controller: TreeItemControllerBase<ResolvedStaticWebAppModel> = {
        refresh: async (model: ResolvedStaticWebAppModel) => {
            model.repositoryUrl = 'https://github.com/alexweininger/angular-basic.git';
        }
    };
}

class ServiceCache<Base extends BaseModel, R extends object> {
    public readonly cache: Map<string, Base> = new Map();
    public readonly resolvedCache: Map<string, ResolvedModel<R>> = new Map();
}

const treeItemServiceMap = {
    'staticWebApp': new StaticWebAppTreeItemService()
} as const;

type Service = keyof typeof treeItemServiceMap;

interface TreeItemService<Base extends BaseModel> {
    id: string;
    createTreeItem: TreeItemFactory<Base>;
    controller: TreeItemControllerBase<Base>;
}

interface InternalTreeItem {
    id: string;
    parentId: string;
}

interface ServiceTreeNode extends TreeElementBase {
    service: Service;
}

export class MVCTreeViewProvider implements vscode.TreeDataProvider<TreeElementBase> {

    private onDidChangeTreeDataEmitter = new EventEmitter<TreeElementBase | undefined>();

    private tree: TreeSkeleton<ServiceTreeNode>;

    constructor() {
        this.tree = tree;
    }

    public id = 'hello';

    public onDidChangeTreeData: Event<TreeElementBase | undefined> = this.onDidChangeTreeDataEmitter.event;

    public getTreeItem(element: InternalNode<TreeElementBase> | TreeElementBase): TreeItem {

        const treeService = treeItemServiceMap[element.service];
        
        const treeItem = treeService.createTreeItem({
            id: element.id,
            name: element.id,
            type: 'staticWebApp',
            serviceId: element.service
        });

        return {
            ...treeItem,
            collapsibleState: this.isInternalNode(element) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        };
    }

    public async getChildren(element?: InternalNode<TreeElementBase> | undefined): Promise<(TreeItem & TreeElementBase)[]> {
        if (!element) {
            return this.tree.children;
        } else {
            return this.findTreeItem(element.id, this.tree)?.children ?? [];
        }
    }

    public getParent(element: TreeElementBase): TreeElementBase | undefined {

        if (element.id === 'root') {
            return undefined;
        }

        return this.findParent(element.id, this.tree, this.tree);
    };

    private findTreeItem(id: string, tree: TreeSkeleton<TreeElementBase>): InternalNode<TreeElementBase> | undefined {
        if (tree.id === id) {
            return tree;
        }

        for (const child of tree.children) {
            let result =  this.findTreeItem(id, child as InternalNode<TreeElementBase>);
            if (result) {
                return result;
            }
        }

        return undefined;
    }

    private findParent(id: string, tree: TreeSkeleton<TreeElementBase>, parent: TreeSkeleton<TreeElementBase>): InternalNode<TreeElementBase> | undefined {
        if (tree.id === id) {
            return parent;
        }

        for (const child of tree.children) {
            let result = this.findParent(id, child as InternalNode<TreeElementBase>, tree);
            if (result) {
                return result;
            }
        }

        return undefined;
    }

    private isInternalNode(node: TreeElementBase | InternalNode<TreeElementBase>): node is InternalNode<TreeElementBase> {
        return node.hasOwnProperty('children');
    }
}