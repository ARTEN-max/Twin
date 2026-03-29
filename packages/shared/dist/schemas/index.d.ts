import { z } from 'zod';

declare const RecordingMode: z.ZodEnum<["general", "sales", "interview", "meeting"]>;
declare const RecordingStatus: z.ZodEnum<["pending", "uploaded", "processing", "complete", "failed"]>;
declare const JobType: z.ZodEnum<["TRANSCRIBE", "DEBRIEF"]>;
declare const JobStatus: z.ZodEnum<["pending", "running", "complete", "failed"]>;
declare const userSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    email: string;
}, {
    id: string;
    email: string;
}>;
declare const createUserSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    email: z.ZodString;
}, "id">, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
declare const recordingSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    title: z.ZodString;
    mode: z.ZodEnum<["general", "sales", "interview", "meeting"]>;
    status: z.ZodEnum<["pending", "uploaded", "processing", "complete", "failed"]>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "pending" | "uploaded" | "processing" | "complete" | "failed";
    userId: string;
    title: string;
    mode: "general" | "sales" | "interview" | "meeting";
    createdAt: Date;
}, {
    id: string;
    status: "pending" | "uploaded" | "processing" | "complete" | "failed";
    userId: string;
    title: string;
    mode: "general" | "sales" | "interview" | "meeting";
    createdAt: Date;
}>;
declare const createRecordingSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    userId: z.ZodString;
    title: z.ZodString;
    mode: z.ZodEnum<["general", "sales", "interview", "meeting"]>;
    status: z.ZodEnum<["pending", "uploaded", "processing", "complete", "failed"]>;
    createdAt: z.ZodDate;
}, "id" | "status" | "createdAt">, "strip", z.ZodTypeAny, {
    userId: string;
    title: string;
    mode: "general" | "sales" | "interview" | "meeting";
}, {
    userId: string;
    title: string;
    mode: "general" | "sales" | "interview" | "meeting";
}>;
declare const updateRecordingSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    mode: z.ZodOptional<z.ZodEnum<["general", "sales", "interview", "meeting"]>>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    mode?: "general" | "sales" | "interview" | "meeting" | undefined;
}, {
    title?: string | undefined;
    mode?: "general" | "sales" | "interview" | "meeting" | undefined;
}>;
declare const transcriptSegmentSchema: z.ZodObject<{
    start: z.ZodNumber;
    end: z.ZodNumber;
    text: z.ZodString;
    speaker: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    start: number;
    end: number;
    text: string;
    speaker?: string | undefined;
}, {
    start: number;
    end: number;
    text: string;
    speaker?: string | undefined;
}>;
declare const transcriptSchema: z.ZodObject<{
    id: z.ZodString;
    recordingId: z.ZodString;
    text: z.ZodString;
    segments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
        text: z.ZodString;
        speaker: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }, {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }>, "many">>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    text: string;
    recordingId: string;
    segments?: {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }[] | undefined;
}, {
    id: string;
    createdAt: Date;
    text: string;
    recordingId: string;
    segments?: {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }[] | undefined;
}>;
declare const createTranscriptSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    recordingId: z.ZodString;
    text: z.ZodString;
    segments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
        text: z.ZodString;
        speaker: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }, {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }>, "many">>;
    createdAt: z.ZodDate;
}, "id" | "createdAt">, "strip", z.ZodTypeAny, {
    text: string;
    recordingId: string;
    segments?: {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }[] | undefined;
}, {
    text: string;
    recordingId: string;
    segments?: {
        start: number;
        end: number;
        text: string;
        speaker?: string | undefined;
    }[] | undefined;
}>;
declare const debriefSectionSchema: z.ZodObject<{
    title: z.ZodString;
    content: z.ZodString;
    order: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    title: string;
    content: string;
    order: number;
}, {
    title: string;
    content: string;
    order: number;
}>;
declare const debriefSchema: z.ZodObject<{
    id: z.ZodString;
    recordingId: z.ZodString;
    markdown: z.ZodString;
    sections: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        content: z.ZodString;
        order: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        content: string;
        order: number;
    }, {
        title: string;
        content: string;
        order: number;
    }>, "many">;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    recordingId: string;
    markdown: string;
    sections: {
        title: string;
        content: string;
        order: number;
    }[];
}, {
    id: string;
    createdAt: Date;
    recordingId: string;
    markdown: string;
    sections: {
        title: string;
        content: string;
        order: number;
    }[];
}>;
declare const createDebriefSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    recordingId: z.ZodString;
    markdown: z.ZodString;
    sections: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        content: z.ZodString;
        order: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        content: string;
        order: number;
    }, {
        title: string;
        content: string;
        order: number;
    }>, "many">;
    createdAt: z.ZodDate;
}, "id" | "createdAt">, "strip", z.ZodTypeAny, {
    recordingId: string;
    markdown: string;
    sections: {
        title: string;
        content: string;
        order: number;
    }[];
}, {
    recordingId: string;
    markdown: string;
    sections: {
        title: string;
        content: string;
        order: number;
    }[];
}>;
declare const jobSchema: z.ZodObject<{
    id: z.ZodString;
    recordingId: z.ZodString;
    type: z.ZodEnum<["TRANSCRIBE", "DEBRIEF"]>;
    status: z.ZodEnum<["pending", "running", "complete", "failed"]>;
    error: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "TRANSCRIBE" | "DEBRIEF";
    status: "pending" | "complete" | "failed" | "running";
    createdAt: Date;
    recordingId: string;
    error: string | null;
    updatedAt: Date;
}, {
    id: string;
    type: "TRANSCRIBE" | "DEBRIEF";
    status: "pending" | "complete" | "failed" | "running";
    createdAt: Date;
    recordingId: string;
    error: string | null;
    updatedAt: Date;
}>;
declare const createJobSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    recordingId: z.ZodString;
    type: z.ZodEnum<["TRANSCRIBE", "DEBRIEF"]>;
    status: z.ZodEnum<["pending", "running", "complete", "failed"]>;
    error: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "id" | "status" | "createdAt" | "error" | "updatedAt">, "strip", z.ZodTypeAny, {
    type: "TRANSCRIBE" | "DEBRIEF";
    recordingId: string;
}, {
    type: "TRANSCRIBE" | "DEBRIEF";
    recordingId: string;
}>;
declare const apiErrorSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodString;
    statusCode: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    message: string;
    error: string;
    statusCode: number;
}, {
    message: string;
    error: string;
    statusCode: number;
}>;
declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    total: z.ZodNumber;
    totalPages: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}, {
    total: number;
    totalPages: number;
    page?: number | undefined;
    limit?: number | undefined;
}>;
declare const paginationQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
}, {
    page?: number | undefined;
    limit?: number | undefined;
}>;
declare const audioUploadSchema: z.ZodObject<{
    filename: z.ZodString;
    mimeType: z.ZodEnum<["audio/mpeg", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/m4a", "audio/x-m4a"]>;
    size: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    filename: string;
    mimeType: "audio/mpeg" | "audio/wav" | "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/m4a" | "audio/x-m4a";
    size: number;
}, {
    filename: string;
    mimeType: "audio/mpeg" | "audio/wav" | "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/m4a" | "audio/x-m4a";
    size: number;
}>;

export { JobStatus, JobType, RecordingMode, RecordingStatus, apiErrorSchema, audioUploadSchema, createDebriefSchema, createJobSchema, createRecordingSchema, createTranscriptSchema, createUserSchema, debriefSchema, debriefSectionSchema, jobSchema, paginationQuerySchema, paginationSchema, recordingSchema, transcriptSchema, transcriptSegmentSchema, updateRecordingSchema, userSchema };
