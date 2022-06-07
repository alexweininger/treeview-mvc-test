import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem } from "vscode";

class MVCTreeViewProvider implements TreeDataProvider<TreeItem> {

    private onDidChangeTreeDataEmitter = new EventEmitter<TreeItem | undefined>();

    public onDidChangeTreeData: Event<TreeItem | undefined> = this.onDidChangeTreeDataEmitter.event;

    public async getTreeItem(element: TreeItem): Promise<TreeItem> {
        return element;
    }

    public async getChildren(element?: TreeItem | undefined): Promise<TreeItem[]> {

        if (element) {   
            return [];
        } else {
            return [{
                label: 'root',
            }];
        }
    }
}