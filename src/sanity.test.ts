console.log(">>> TS FILE ACTUALLY RAN <<<");

// ... rest stays the same
import{describe, it, expect}from "vitest";
describe ("sanity", () =>{
    it("works", () =>{
        expect(true).toBe(true);
    });
});