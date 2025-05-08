import * as vscode from 'vscode';
import { VSCodeAPI } from '../../executor/commandExecutor';

export class MockVSCode implements VSCodeAPI {
    private mockExtensions = {
        getExtension: () => undefined
    };

    public setExtensions(mock: any) {
        this.mockExtensions = mock;
    }

    public get extensions() {
        return this.mockExtensions;
    }
}

export const mockVscode = new MockVSCode();