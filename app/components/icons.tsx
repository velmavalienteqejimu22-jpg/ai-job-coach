"use client";

import React from "react";

// 简单的图标组件，用于替代 lucide-react
export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  const style = { width: size, height: size };
  const icons: Record<string, JSX.Element> = {
    bot: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M12 8V4H8" /><path d="m8 8 4-4 4 4" /><path d="M8 12c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2" /></svg>,
    user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
    arrowUp: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>,
    chevronDown: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><polyline points="6 9 12 15 18 9" /></svg>,
    logOut: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
    activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
    compass: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>,
    layers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
    fileText: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
    send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
    mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
    dollarSign: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    checkCircle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
    lightbulb: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>,
    download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
    wand2: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72z" /><line x1="14" y1="7" x2="17" y2="10" /></svg>,
    layoutTemplate: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    clipboardList: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M9 2a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H9z" /><path d="M9 2h6v6H9V2z" /><line x1="12" y1="11" x2="15" y2="11" /><line x1="12" y1="15" x2="15" y2="15" /><line x1="12" y1="19" x2="15" y2="19" /></svg>,
    edit3: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
    externalLink: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
    arrowLeft: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
  };

  return <span className={`inline-block ${className}`}>{icons[name] || <div style={style} />}</span>;
}

// 导出具名图标组件，方便使用
export const Bot = (props: { size?: number; className?: string }) => <Icon name="bot" {...props} />;
export const User = (props: { size?: number; className?: string }) => <Icon name="user" {...props} />;
export const Target = (props: { size?: number; className?: string }) => <Icon name="target" {...props} />;
export const ArrowUp = (props: { size?: number; className?: string }) => <Icon name="arrowUp" {...props} />;
export const ChevronDown = (props: { size?: number; className?: string }) => <Icon name="chevronDown" {...props} />;
export const LogOut = (props: { size?: number; className?: string }) => <Icon name="logOut" {...props} />;
export const Activity = (props: { size?: number; className?: string }) => <Icon name="activity" {...props} />;
export const Compass = (props: { size?: number; className?: string }) => <Icon name="compass" {...props} />;
export const Layers = (props: { size?: number; className?: string }) => <Icon name="layers" {...props} />;
export const FileText = (props: { size?: number; className?: string }) => <Icon name="fileText" {...props} />;
export const Send = (props: { size?: number; className?: string }) => <Icon name="send" {...props} />;
export const Mic = (props: { size?: number; className?: string }) => <Icon name="mic" {...props} />;
export const DollarSign = (props: { size?: number; className?: string }) => <Icon name="dollarSign" {...props} />;
export const CheckCircle = (props: { size?: number; className?: string }) => <Icon name="checkCircle" {...props} />;
export const Lightbulb = (props: { size?: number; className?: string }) => <Icon name="lightbulb" {...props} />;
export const Download = (props: { size?: number; className?: string }) => <Icon name="download" {...props} />;
export const Upload = (props: { size?: number; className?: string }) => <Icon name="upload" {...props} />;
export const Wand2 = (props: { size?: number; className?: string }) => <Icon name="wand2" {...props} />;
export const LayoutTemplate = (props: { size?: number; className?: string }) => <Icon name="layoutTemplate" {...props} />;
export const ClipboardList = (props: { size?: number; className?: string }) => <Icon name="clipboardList" {...props} />;
export const Edit3 = (props: { size?: number; className?: string }) => <Icon name="edit3" {...props} />;
export const ExternalLink = (props: { size?: number; className?: string }) => <Icon name="externalLink" {...props} />;
export const ArrowLeft = (props: { size?: number; className?: string }) => <Icon name="arrowLeft" {...props} />;

