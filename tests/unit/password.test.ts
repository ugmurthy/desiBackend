import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/utils/password";

describe("password utilities", () => {
  it("hashPassword returns a non-empty string different from input", async () => {
    const password = "my-secret-password";
    const hashed = await hashPassword(password);

    expect(hashed).toBeTruthy();
    expect(hashed).not.toBe(password);
  });

  it("verifyPassword returns true for correct password", async () => {
    const password = "correct-horse-battery-staple";
    const hashed = await hashPassword(password);

    expect(await verifyPassword(password, hashed)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const password = "correct-horse-battery-staple";
    const hashed = await hashPassword(password);

    expect(await verifyPassword("wrong-password", hashed)).toBe(false);
  });

  it("two hashes of the same password are different (salted)", async () => {
    const password = "same-password";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });
});
