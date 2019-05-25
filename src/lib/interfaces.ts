
export interface IMainOptions {
  fileList: ITarFileEntry[];
}

export interface ITarFileEntry {
  filePath: string;
  date?: Date;
}
export interface IObject {
  [key: string]: any;
}
