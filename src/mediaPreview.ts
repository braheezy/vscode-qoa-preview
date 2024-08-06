/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { Disposable } from './util/dispose';

export function reopenAsText(resource: vscode.Uri, viewColumn: vscode.ViewColumn | undefined) {
	vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
}

export const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

export abstract class MediaPreview extends Disposable {

	protected previewState = PreviewState.Visible;

	constructor(
		extensionRoot: vscode.Uri,
		protected readonly resource: vscode.Uri,
		protected readonly webviewEditor: vscode.WebviewPanel,
	) {
		super();

		webviewEditor.webview.options = {
			enableScripts: true,
			enableForms: false,
			localResourceRoots: [
				Utils.dirname(resource),
				extensionRoot,
			]
		};

		this._register(webviewEditor.onDidChangeViewState(() => {
			this.updateState();
		}));

		this._register(webviewEditor.onDidDispose(() => {
			this.previewState = PreviewState.Disposed;
			this.dispose();
		}));

		const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(resource, '*')));
		this._register(watcher.onDidChange(e => {
			if (e.toString() === this.resource.toString()) {
				this.render();
			}
		}));

		this._register(watcher.onDidDelete(e => {
			if (e.toString() === this.resource.toString()) {
				this.webviewEditor.dispose();
			}
		}));
	}

	public override dispose() {
		super.dispose();
	}

	protected async render() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		const content = await this.getWebviewContents();
		if (this.previewState as PreviewState === PreviewState.Disposed) {
			return;
		}

		this.webviewEditor.webview.html = content;
	}

	protected abstract getWebviewContents(): Promise<string>;

	protected updateState() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewEditor.active) {
			this.previewState = PreviewState.Active;
		} else {
			this.previewState = PreviewState.Visible;
		}
	}
}
