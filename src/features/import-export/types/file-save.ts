export interface NativeSaveFileType {
  description?: string;
  accept: Record<string, string[]>;
}

export interface NativeSaveFilePickerOptions {
  suggestedName?: string;
  types?: NativeSaveFileType[];
}

export interface NativeHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

export type NativePermissionState = "granted" | "denied" | "prompt";

export interface NativeSaveWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface NativeSaveFileHandle {
  name?: string;
  createWritable(): Promise<NativeSaveWritable>;
  queryPermission?: (
    descriptor?: NativeHandlePermissionDescriptor,
  ) => Promise<NativePermissionState>;
  requestPermission?: (
    descriptor?: NativeHandlePermissionDescriptor,
  ) => Promise<NativePermissionState>;
}

export interface SaveBlobFileOptions {
  fileHandle?: NativeSaveFileHandle;
}

export interface SaveBlobFileResult {
  status: "saved" | "cancelled" | "downloaded";
  filename: string;
  fileHandle?: NativeSaveFileHandle;
  reusedExistingHandle: boolean;
}

export interface NativeSaveWindow extends Window {
  showSaveFilePicker?: (
    options?: NativeSaveFilePickerOptions,
  ) => Promise<NativeSaveFileHandle>;
}
