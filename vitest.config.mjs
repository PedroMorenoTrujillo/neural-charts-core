import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],maxWorkers:2,fileParallelism:true,watch:false},cacheDir:'work/vite-cache'});
