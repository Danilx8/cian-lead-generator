import Item from "../../database/item.model";
import Merchant from "../../database/merchant.model";

function generateRandomDigits(count: number): string {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
}

function generateRandomLowercase(count: number): string {
  return Array.from({ length: count }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join("");
}

function generateRandomUppercase(count: number): string {
  return Array.from({ length: count }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join("");
}

function generateRandomMixed(count: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: count }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function prepareMessage(message: string, merchant: Merchant, item: Item, userId: number) {
  const variables: Record<string, string> = {
    product_name: item.name,
    product_price: item.price?.toString() ?? "",
    seller_name: merchant.name,
    timestamp: new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }),
    date: new Date().toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }),
    time: new Date().toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" }),
    greeting: new Date().getHours() >= 6 && new Date().getHours() < 12 ? "Доброе утро"
      : new Date().getHours() >= 12 && new Date().getHours() < 18 ? "Добрый день"
        : new Date().getHours() >= 18 && new Date().getHours() < 23 ? "Добрый вечер"
          : "Доброй ночи"
  };

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    if (!value || value.trim() === "") {
      message = message.replace(new RegExp(placeholder, "g"), "");
    } else {
      message = message.replace(new RegExp(placeholder, "g"), value);
    }
  }

  message = message.replace(/{{random_number\((\d+)\)}}/g, (_, count) =>
    generateRandomDigits(parseInt(count))
  );
  message = message.replace(/{{random_lowercase\((\d+)\)}}/g, (_, count) =>
    generateRandomLowercase(parseInt(count))
  );
  message = message.replace(/{{random_uppercase\((\d+)\)}}/g, (_, count) =>
    generateRandomUppercase(parseInt(count))
  );
  message = message.replace(/{{random\((\d+)\)}}/g, (_, count) =>
    generateRandomMixed(parseInt(count))
  );

  return message;
}
