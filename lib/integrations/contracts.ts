import type { Entry } from '../storage/types';
// Extension seams only. No pretend encryption, AI calls, or native implementation.
export interface EncryptionProvider { encrypt(data: Uint8Array): Promise<Uint8Array>; decrypt(data: Uint8Array): Promise<Uint8Array> }
export interface ReflectionProvider { reflect(entry: Entry): Promise<string> }
export interface PdfExporter { export(entries: Entry[]): Promise<Blob> }
export interface NativeDevice { choosePhotos(): Promise<File[]>; share(file: File): Promise<void> }
