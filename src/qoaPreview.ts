import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

class QOAPreviewProvider implements vscode.CustomReadonlyEditorProvider {
    public static readonly viewType = 'qoa-vscode-extension.qoaPreview';

    constructor(
        private readonly extensionRoot: vscode.Uri,
    ) {
    }

    public async openCustomDocument(uri: vscode.Uri) {
        return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: vscode.CustomDocument, webviewEditor: vscode.WebviewPanel): Promise<void> {
        new QOAPreview(this.extensionRoot, document.uri, webviewEditor);
    }
}

export const enum PreviewState {
    Disposed,
    Visible,
    Active,
}
export function disposeAll(disposables: vscode.Disposable[]) {
    while (disposables.length) {
        const item = disposables.pop();
        if (item) {
            item.dispose();
        }
    }
}
class QOAPreview {
    protected previewState = PreviewState.Visible;
    private _isDisposed = false;

    protected _disposables: vscode.Disposable[] = [];

    public dispose(): any {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        disposeAll(this._disposables);
    }

    protected _register<T extends vscode.Disposable>(value: T): T {
        if (this._isDisposed) {
            value.dispose();
        } else {
            this._disposables.push(value);
        }
        return value;
    }

    protected get isDisposed() {
        return this._isDisposed;
    }


    constructor(
        private readonly extensionRoot: vscode.Uri,
        protected readonly resource: vscode.Uri,
        protected readonly webviewEditor: vscode.WebviewPanel,
    ) {
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

        this._register(webviewEditor.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'reopen-as-text': {
                    this.reopenAsText(resource, webviewEditor.viewColumn);
                    break;
                }
            }
        }));

        this.render();
        this.updateState();
    }

    protected async getWebviewContents(): Promise<string> {
        const version = Date.now().toString();
        const settings = {
            src: await this.getResourcePath(this.webviewEditor, this.resource, version),
        };

        const nonce = this.getNonce();
        const cspSource = this.webviewEditor.webview.cspSource;

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <!-- Disable pinch zooming -->
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

  <title>Audio Preview</title>

  <link rel="stylesheet" href="${this.escapeAttribute(this.extensionResource('src', 'media', 'audioPreview.css'))}" type="text/css" media="screen" nonce="${nonce}">

  <meta http-equiv="Content-Security-Policy"  img-src data: ${cspSource}; media-src ${cspSource}; script-src 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}';">
  <meta id="settings" data-settings="${this.escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container loading" data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
  <div class="audio-player" id="audio-player">
    <button class="play-pause" id="play-pause-btn">
      <img src="${this.escapeAttribute(this.extensionResource('src', 'media', 'play.svg'))}" alt="Play" id="play-icon">
      <img src="${this.escapeAttribute(this.extensionResource('src', 'media', 'pause.svg'))}" alt="Pause" id="pause-icon" style="display: none;">
    </button>
    <span class="time-display" id="time-display">0:00 / 0:00</span>
    <input type="range" class="seek-slider" id="seek-slider" max="100" value="0">
    <button class="mute" id="mute-btn">
      <img src="${this.escapeAttribute(this.extensionResource('src', 'media', 'volume.svg'))}" alt="Volume" id="volume-icon">
      <img src="${this.escapeAttribute(this.extensionResource('src', 'media', 'mute.svg'))}" alt="Mute" id="mute-icon" style="display: none;">
    </button>
  </div>
  <div class="loading-error" id="loading-error" style="display: none;">
    <p>${vscode.l10n.t("An error occurred while loading the audio file.")}</p>
    <a href="#" class="open-file-link">${vscode.l10n.t("Open file using VS Code's standard text/binary editor?")}</a>
  </div>
  <script type="module" src="${this.escapeAttribute(this.extensionResource('src', 'qoaDecoder.js'))}" nonce="${nonce}"></script>
  <script type="module" src="${this.escapeAttribute(this.extensionResource('src', 'media', 'audioPreview.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
    }

    private async getResourcePath(webviewEditor: vscode.WebviewPanel, resource: vscode.Uri, version: string): Promise<string | null> {
        if (resource.scheme === 'git') {
            const stat = await vscode.workspace.fs.stat(resource);
            if (stat.size === 0) {
                // The file is stored on git lfs
                return null;
            }
        }

        // Avoid adding cache busting if there is already a query string
        if (resource.query) {
            return webviewEditor.webview.asWebviewUri(resource).toString();
        }
        return webviewEditor.webview.asWebviewUri(resource).with({ query: `version=${version}` }).toString();
    }

    private extensionResource(...parts: string[]) {
        const resourcePath = this.webviewEditor.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionRoot, ...parts));
        return resourcePath;
    }

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
    protected reopenAsText(resource: vscode.Uri, viewColumn: vscode.ViewColumn | undefined) {
        vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
    }
    protected escapeAttribute(value: string | vscode.Uri): string {
        return value.toString().replace(/"/g, '&quot;');
    }

    protected getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 64; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

}

export function registerQOAPreviewSupport(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new QOAPreviewProvider(context.extensionUri);
    return vscode.window.registerCustomEditorProvider(QOAPreviewProvider.viewType, provider, {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: {
            retainContextWhenHidden: true,
        }
    });
}
