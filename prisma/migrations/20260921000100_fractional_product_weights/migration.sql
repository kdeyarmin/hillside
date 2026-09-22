-- Preserve existing whole-ounce weights while allowing fractional ounces.
ALTER TABLE "Product" ALTER COLUMN "weightOunces" TYPE DOUBLE PRECISION;
