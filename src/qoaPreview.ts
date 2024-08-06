import * as vscode from 'vscode';
import { MediaPreview, reopenAsText } from './mediaPreview';
import { escapeAttribute, getNonce } from './util/dom';

class QOAPreviewProvider implements vscode.CustomReadonlyEditorProvider {
    public static readonly viewType = 'qoa-vscode-extension.qoaPreview';

    constructor(
        private readonly extensionRoot: vscode.Uri,
    ) {
        console.log('QOAPreviewProvider constructor called');
    }

    public async openCustomDocument(uri: vscode.Uri) {
        console.log('openCustomDocument called with URI:', uri.toString());
        return { uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: vscode.CustomDocument, webviewEditor: vscode.WebviewPanel): Promise<void> {
        console.log('resolveCustomEditor called with document URI:', document.uri.toString());
        console.log('resolveCustomEditor extensionRoot:', this.extensionRoot);
        new QOAPreview(this.extensionRoot, document.uri, webviewEditor);
    }
}

class QOAPreview extends MediaPreview {
    constructor(
        private readonly extensionRoot: vscode.Uri,
        resource: vscode.Uri,
        webviewEditor: vscode.WebviewPanel,
    ) {
        super(extensionRoot, resource, webviewEditor);
        console.log('QOAPreview constructor called with resource URI:', resource.toString());

        this._register(webviewEditor.webview.onDidReceiveMessage(message => {
            console.log('Message received from webview:', message);
            switch (message.type) {
                case 'reopen-as-text': {
                    reopenAsText(resource, webviewEditor.viewColumn);
                    break;
                }
            }
        }));

        this.updateBinarySize();
        this.render();
        this.updateState();
    }

    protected async getWebviewContents(): Promise<string> {
        const version = Date.now().toString();
        const settings = {
            src: await this.getResourcePath(this.webviewEditor, this.resource, version),
        };

        console.log('getWebviewContents called, settings:', settings);
        console.log('getWebviewContents called, this.webviewEditor.webview.cspSource:', this.webviewEditor.webview.cspSource);

        const nonce = getNonce();
        const cspSource = this.webviewEditor.webview.cspSource;

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <!-- Disable pinch zooming -->
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

  <title>Audio Preview</title>

  <link rel="stylesheet" href="${escapeAttribute(this.extensionResource('src', 'media', 'audioPreview.css'))}" type="text/css" media="screen" nonce="${nonce}">

  <meta http-equiv="Content-Security-Policy"  img-src data: ${cspSource}; media-src ${cspSource}; script-src 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}';">
  <meta id="settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="container loading" data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
  <div class="audio-player">
    <button class="play-pause" id="play-pause-btn">
      <img src="${escapeAttribute(this.extensionResource('src', 'media', 'play.svg'))}" alt="Play" id="play-icon">
      <img src="${escapeAttribute(this.extensionResource('src', 'media', 'pause.svg'))}" alt="Pause" id="pause-icon" style="display: none;">
    </button>
    <span class="time-display" id="time-display">0:00 / 0:00</span>
    <input type="range" class="seek-slider" id="seek-slider" max="100" value="0">
    <button class="mute" id="mute-btn">
      <img src="${escapeAttribute(this.extensionResource('src', 'media', 'volume.svg'))}" alt="Volume" id="volume-icon">
      <img src="${escapeAttribute(this.extensionResource('src', 'media', 'mute.svg'))}" alt="Mute" id="mute-icon" style="display: none;">
    </button>
  </div>
  <script type="module" src="${escapeAttribute(this.extensionResource('src', 'qoaDecoder.js'))}" nonce="${nonce}"></script>
  <script type="module" src="${escapeAttribute(this.extensionResource('src', 'media', 'audioPreview.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
    }

    private async getResourcePath(webviewEditor: vscode.WebviewPanel, resource: vscode.Uri, version: string): Promise<string | null> {
        console.log('getResourcePath called with resource URI:', resource.toString());
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
        console.log('extensionResource called, resource path:', resourcePath.toString());
        return resourcePath;
    }
}

export function registerQOAPreviewSupport(context: vscode.ExtensionContext): vscode.Disposable {
    console.log('registerQOAPreviewSupport called', context.extensionUri);
    const provider = new QOAPreviewProvider(context.extensionUri);
    return vscode.window.registerCustomEditorProvider(QOAPreviewProvider.viewType, provider, {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: {
            retainContextWhenHidden: true,
        }
    });
}
