import * as vscode from 'vscode';
import { registerQOAPreviewSupport } from './qoaPreview';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerQOAPreviewSupport(context));
}
