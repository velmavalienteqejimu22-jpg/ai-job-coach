import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "没有上传文件" },
        { status: 400 }
      );
    }

    // 解析所有文件内容
    const contents: string[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      
      if (ext === "pdf") {
        // PDF 解析（简化版，实际应该使用 PDF 解析库）
        // 这里返回文件名作为占位符
        contents.push(`[PDF文件：${file.name}]`);
      } else if (ext === "docx") {
        // DOCX 解析（简化版，实际应该使用 DOCX 解析库）
        // 这里返回文件名作为占位符
        contents.push(`[DOCX文件：${file.name}]`);
      } else {
        // 文本文件直接读取
        try {
          const text = await file.text();
          contents.push(text);
        } catch (error) {
          contents.push(`[无法读取文件：${file.name}]`);
        }
      }
    }

    // 合并所有文件内容
    const combinedContent = contents.join("\n\n---\n\n");

    return NextResponse.json({
      content: combinedContent,
      fileCount: files.length,
    });
  } catch (error: any) {
    console.error("文件解析错误:", error);
    return NextResponse.json(
      {
        error: "文件解析失败",
        message: error.message,
      },
      { status: 500 }
    );
  }
}



