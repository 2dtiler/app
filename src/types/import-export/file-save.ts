export interface NativeSaveFileType {
  description?: string;
  accept: Record<string, string[]>;
}

export interface NativeSaveFilePickerOptions {
  suggestedName?: string;
  types?: NativeSaveFileType[];
}

export interface NativeSaveWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface NativeSaveFileHandle {
  createWritable(): Promise<NativeSaveWritable>;
}

export interface NativeSaveWindow extends Window {
  showSaveFilePicker?: (
    options?: NativeSaveFilePickerOptions,
  ) => Promise<NativeSaveFileHandle>;
}