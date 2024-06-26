"use server";

import db from "@/db/db";
import * as z from "zod";

import fs from "fs/promises";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const fileSchema = z.instanceof(File, { message: "Required" });

const imageSchema = fileSchema.refine(
  file => file.size === 0 || file.type.startsWith("image/")
);
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const addFormSchema = z.object({
  name: z.string().min(1).trim(),
  description: z.string().min(1).trim(),
  priceInCents: z.coerce.number().int().min(1),
  file: fileSchema.refine(
    file => {
      // Check if the file exists and its size is within the allowed limit
      return file && file.size > 0 && file.size <= MAX_FILE_SIZE_BYTES;
    },
    { message: `File size must be less than ${MAX_FILE_SIZE_BYTES} bytes` }
  ),
  image: imageSchema.refine(
    file => {
      // Check if the file exists and its size is within the allowed limit
      return file && file.size > 0 && file.size <= MAX_FILE_SIZE_BYTES;
    },
    { message: `Image size must be less than ${MAX_FILE_SIZE_BYTES} bytes` }
  ),
});

export async function addProduct(prevState: unknown, formData: FormData) {
  const result = addFormSchema.safeParse(
    Object.fromEntries(formData.entries())
  );
  if (result.success === false) {
    return result.error.formErrors.fieldErrors;
  }
  const data = result.data;

  await fs.mkdir("products", { recursive: true });
  const filePath = `products/${crypto.randomUUID()}-${data.file.name}`;
  await fs.writeFile(filePath, Buffer.from(await data.file.arrayBuffer()));

  await fs.mkdir("public/products", { recursive: true });
  const imagePath = `/products/${crypto.randomUUID()}-${data.image.name}`;
  await fs.writeFile(
    `public${imagePath}`,
    Buffer.from(await data.image.arrayBuffer())
  );

  await db.product.create({
    data: {
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
      inStock: false,
    },
  });

  revalidatePath("/");
  revalidatePath("/products");
  redirect("/admin/products");
}

const editSchema = addFormSchema.extend({
  file: fileSchema.optional(),
  image: imageSchema.optional(),
});
export async function updateProduct(
  id: string,
  prevState: unknown,
  formData: FormData
) {
  const result = editSchema.safeParse(Object.fromEntries(formData.entries()));
  if (result.success === false) {
    return result.error.formErrors.fieldErrors;
  }
  const data = result.data;
  const product = await db.product.findUnique({
    where: { id },
  });

  if (product === null) return notFound();

  let filePath = product.filePath;

  if (data.file != null && data.file.size > 0) {
    await fs.unlink(product.filePath);
    await fs.mkdir("products", { recursive: true });
    filePath = `products/${crypto.randomUUID()}-${data.file.name}`;
    await fs.writeFile(filePath, Buffer.from(await data.file.arrayBuffer()));
  }

  let imagePath = product.imagePath;

  if (data.image != null && data.image.size > 0) {
    await fs.mkdir("public/products", { recursive: true });
    imagePath = `/products/${crypto.randomUUID()}-${data.image.name}`;
    await fs.writeFile(
      `public${imagePath}`,
      Buffer.from(await data.image.arrayBuffer())
    );
  }

  await db.product.update({
    where: {
      id,
    },
    data: {
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  });

  revalidatePath("/");
  revalidatePath("/products");
  redirect("/admin/products");
}

export const toggleProductAvailability = async (
  id: string,
  inStock: boolean
) => {
  await db.product.update({
    where: { id },
    data: {
      inStock,
    },
  });
  revalidatePath("/");
  revalidatePath("/products");
};

export const deleteProduct = async (id: string) => {
  const product = await db.product.delete({
    where: { id },
  });
  if (product === null) return notFound();

  await fs.unlink(product.filePath);
  await fs.unlink(`public/${product.imagePath}`);
  revalidatePath("/");
  revalidatePath("/products");
};
