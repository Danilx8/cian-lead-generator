import axios, { RawAxiosRequestConfig } from "axios";

export class PictureService {
  public static async getUrlEncodedAttachment(url: string): Promise<string> {
    // Fetch image from URL
    const response = await axios.get(url,
      {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Referer": "https://www.cian.ru"
        }
      } as RawAxiosRequestConfig);

    // Verify content-type is an image
    if (!response.headers["content-type"].startsWith("image/")) {
      throw new Error("URL does not point to an image");
    }

    const contentType = response.headers["content-type"];
    if (!contentType || !contentType.startsWith("image/")) {
      throw new Error("URL does not point to a valid image");
    }

    // Encode to base64
    const base64 = Buffer.from(response.data).toString("base64");
    return `data:${contentType};base64,${base64}`;
  }
}