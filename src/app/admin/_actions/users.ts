"use server";

import db from "@/db/db";

import { notFound, redirect } from "next/navigation";

export const deleteUser = async (id: string) => {
  const user = await db.user.delete({
    where: { id },
  });
  if (user === null) return notFound();

  return user;
};