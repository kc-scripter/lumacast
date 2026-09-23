export type Quality="1080p"|"720p";
export type FrameRate=30|60;
export type CaptureSource={id:string;name:string;kind:"monitor"|"window";thumbnail?:string;displayId?:string};
export type DesktopMetrics={cpu:number;memoryMb:number};
