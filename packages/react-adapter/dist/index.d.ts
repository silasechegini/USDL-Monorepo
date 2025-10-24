import * as react_jsx_runtime from 'react/jsx-runtime';
import React from 'react';
import { UDSL } from '@udsl/core';

declare function useData<T = any>(key: string, params?: Record<string, any>): {
    readonly data: T | null;
    readonly loading: boolean;
    readonly error: Error | null;
};

declare function setGlobalUDSLInstance(instance: UDSL): void;
declare const UDSLProvider: ({ instance, children, }: {
    instance: UDSL;
    children: React.ReactNode;
}) => react_jsx_runtime.JSX.Element;
declare function useUDSL(): UDSL;

export { UDSLProvider, setGlobalUDSLInstance, useData, useUDSL };
