-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PLANT', 'TEA', 'TEA_SUPPLY', 'LOTION', 'SOAP', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductSpecKind" AS ENUM ('PLANT', 'CARNIVOROUS_PLANT', 'TEA', 'SOAP', 'LOTION', 'HARD_GOOD', 'GENERAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('SHIP', 'PICKUP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClassFormat" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('ORDER_CONFIRMATION', 'ORDER_ADMIN', 'PICKUP_READY', 'SHIPPING_UPDATE', 'CLASS_CONFIRMATION', 'CLASS_ADMIN', 'STOCK_ALERT', 'NEWSLETTER', 'CART_RECOVERY', 'CONTACT', 'REVIEW', 'REPLY', 'GIFT_CARD', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CareGuideType" AS ENUM ('PLANT', 'GENERAL', 'PROBLEM', 'SEASONAL', 'BEGINNER');

-- CreateEnum
CREATE TYPE "ProductRelationKind" AS ENUM ('PAIRS_WITH', 'COMPLETES_SETUP', 'SIMILAR');

-- CreateEnum
CREATE TYPE "MerchandisingMode" AS ENUM ('AUTO', 'ALWAYS', 'NEVER');

-- CreateEnum
CREATE TYPE "HomepageSectionKind" AS ENUM ('FEATURED', 'NEW_ARRIVALS', 'BEST_SELLERS', 'RECENT_BEST_SELLERS', 'STAFF_PICKS', 'SEASONAL', 'ON_SALE', 'COLLECTION', 'COLLECTION_TILES', 'BUNDLES');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('STOCKED', 'ON_ORDER', 'MADE_TO_ORDER', 'SEASONAL', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('PERCENT', 'AMOUNT', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "GiftCardEntryKind" AS ENUM ('ISSUE', 'HOLD', 'RELEASE', 'REDEEM', 'REFUND', 'ADJUST');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT,
    "shortDescription" TEXT,
    "description" TEXT NOT NULL,
    "details" TEXT,
    "careNotes" TEXT,
    "shippingNote" TEXT,
    "ships" BOOLEAN NOT NULL DEFAULT true,
    "pickup" BOOLEAN NOT NULL DEFAULT true,
    "type" "ProductType" NOT NULL,
    "categoryId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "compareAtCents" INTEGER,
    "inventory" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "badge" TEXT,
    "sizes" JSONB,
    "sizeLabel" TEXT,
    "giftTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specs" JSONB,
    "weightOunces" INTEGER,
    "dimensions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "staffPick" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "botanical" TEXT,
    "searchTerms" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "traits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bestSellerMode" "MerchandisingMode" NOT NULL DEFAULT 'AUTO',
    "newArrivalMode" "MerchandisingMode" NOT NULL DEFAULT 'AUTO',
    "seasonStartsAt" TIMESTAMP(3),
    "seasonEndsAt" TIMESTAMP(3),
    "galleryImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lifestyleImageUrl" TEXT,
    "detailImageUrl" TEXT,
    "scaleImageUrl" TEXT,
    "packagingImageUrl" TEXT,
    "supplier" TEXT,
    "supplierItemNumber" TEXT,
    "reorderPoint" INTEGER,
    "reorderQuantity" INTEGER,
    "inventoryNotes" TEXT,
    "lastRestockedAt" TIMESTAMP(3),
    "inventoryStatus" "InventoryStatus" NOT NULL DEFAULT 'STOCKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRelation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "kind" "ProductRelationKind" NOT NULL DEFAULT 'PAIRS_WITH',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareGuideProduct" (
    "id" TEXT NOT NULL,
    "careSheetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CareGuideProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "galleryImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceCents" INTEGER NOT NULL,
    "badge" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "specKind" "ProductSpecKind" NOT NULL DEFAULT 'GENERAL',
    "legacyType" "ProductType" NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "intro" TEXT,
    "body" TEXT,
    "faq" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "stripeSessionId" TEXT,
    "paymentIntentId" TEXT,
    "stripeInvoiceId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "subtotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "inventoryRestoredAt" TIMESTAMP(3),
    "shippingMethod" TEXT,
    "fulfillmentMethod" "FulfillmentMethod" NOT NULL DEFAULT 'SHIP',
    "giftMessage" TEXT,
    "pickupNote" TEXT,
    "trackingCarrier" TEXT,
    "trackingNumber" TEXT,
    "internalNotes" TEXT,
    "confirmationEmailSentAt" TIMESTAMP(3),
    "confirmationEmailError" TEXT,
    "reviewRequestSentAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "promotionId" TEXT,
    "promoCode" TEXT,
    "promoDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "giftCardId" TEXT,
    "giftCardCode" TEXT,
    "giftCardCents" INTEGER NOT NULL DEFAULT 0,
    "discountsSettledAt" TIMESTAMP(3),
    "discountsReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "bundleId" TEXT,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemComponent" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareSheet" (
    "id" TEXT NOT NULL,
    "plantName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "guideType" "CareGuideType" NOT NULL DEFAULT 'PLANT',
    "category" TEXT,
    "difficulty" TEXT,
    "botanical" TEXT,
    "summary" TEXT NOT NULL,
    "light" TEXT NOT NULL DEFAULT '',
    "water" TEXT NOT NULL DEFAULT '',
    "humidity" TEXT NOT NULL DEFAULT '',
    "soil" TEXT NOT NULL DEFAULT '',
    "feeding" TEXT NOT NULL DEFAULT '',
    "temperature" TEXT NOT NULL DEFAULT '',
    "petSafety" TEXT,
    "tips" TEXT NOT NULL,
    "symptoms" TEXT,
    "causes" TEXT,
    "treatment" TEXT,
    "prevention" TEXT,
    "checklist" TEXT,
    "imageUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassEvent" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "format" "ClassFormat" NOT NULL DEFAULT 'IN_PERSON',
    "priceCents" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "whatToBring" TEXT,
    "registrationDeadline" TIMESTAMP(3),
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "onlineInstructions" TEXT,
    "telnyxRoomId" TEXT,
    "telnyxRecordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "joinOpensMinutesBefore" INTEGER NOT NULL DEFAULT 30,
    "joinClosesMinutesAfter" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "ClassEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassRegistration" (
    "id" TEXT NOT NULL,
    "classEventId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "amountCents" INTEGER NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "joinTokenHash" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "confirmationEmailSentAt" TIMESTAMP(3),
    "lastJoinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonPick" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "amazonUrl" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AmazonPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT DEFAULT 'website',
    "sourceDetail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',
    "kind" "EmailKind" NOT NULL DEFAULT 'OTHER',
    "status" "EmailStatus" NOT NULL,
    "reason" TEXT,
    "providerId" TEXT,
    "contactMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "intro" TEXT,
    "body" TEXT,
    "faq" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepageSection" (
    "id" TEXT NOT NULL,
    "kind" "HomepageSectionKind" NOT NULL,
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "maxItems" INTEGER NOT NULL DEFAULT 4,
    "collectionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "email" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "ownerReply" TEXT,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "itemsJson" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedMarker" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedMarker_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "kind" "DiscountKind" NOT NULL DEFAULT 'PERCENT',
    "percentOff" INTEGER,
    "amountOffCents" INTEGER,
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptionsUsed" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "batch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "reservedCents" INTEGER NOT NULL DEFAULT 0,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "purchaserName" TEXT,
    "purchaserEmail" TEXT,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "batch" TEXT,
    "note" TEXT,
    "issuedBy" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardEntry" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "kind" "GiftCardEntryKind" NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "reservedDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "balanceAfterCents" INTEGER NOT NULL,
    "reservedAfterCents" INTEGER NOT NULL,
    "orderId" TEXT,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CollectionCareGuides" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CollectionCareGuides_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CategoryCareGuides" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CategoryCareGuides_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProductCollections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductCollections_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "ProductRelation_relatedProductId_idx" ON "ProductRelation"("relatedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRelation_productId_relatedProductId_kind_key" ON "ProductRelation"("productId", "relatedProductId", "kind");

-- CreateIndex
CREATE INDEX "CareGuideProduct_productId_idx" ON "CareGuideProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CareGuideProduct_careSheetId_productId_key" ON "CareGuideProduct"("careSheetId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_slug_key" ON "Bundle"("slug");

-- CreateIndex
CREATE INDEX "BundleItem_bundleId_idx" ON "BundleItem"("bundleId");

-- CreateIndex
CREATE INDEX "BundleItem_productId_idx" ON "BundleItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentIntentId_key" ON "Order"("paymentIntentId");

-- CreateIndex
CREATE INDEX "Order_promotionId_idx" ON "Order"("promotionId");

-- CreateIndex
CREATE INDEX "Order_giftCardId_idx" ON "Order"("giftCardId");

-- CreateIndex
CREATE INDEX "OrderItem_bundleId_idx" ON "OrderItem"("bundleId");

-- CreateIndex
CREATE INDEX "OrderItemComponent_orderItemId_idx" ON "OrderItemComponent"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemComponent_productId_idx" ON "OrderItemComponent"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CareSheet_slug_key" ON "CareSheet"("slug");

-- CreateIndex
CREATE INDEX "CareSheet_productId_idx" ON "CareSheet"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEvent_slug_key" ON "ClassEvent"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEvent_telnyxRoomId_key" ON "ClassEvent"("telnyxRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassRegistration_stripeSessionId_key" ON "ClassRegistration"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassRegistration_paymentIntentId_key" ON "ClassRegistration"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassRegistration_joinTokenHash_key" ON "ClassRegistration"("joinTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_contactMessageId_idx" ON "EmailLog"("contactMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "HomepageSection_active_sortOrder_idx" ON "HomepageSection"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "Review_productId_status_idx" ON "Review"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockAlert_productId_email_key" ON "StockAlert"("productId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CartLead_email_key" ON "CartLead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_categoryId_idx" ON "Promotion"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_orderId_key" ON "PromotionRedemption"("orderId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_idx" ON "PromotionRedemption"("promotionId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardEntry_reference_key" ON "GiftCardEntry"("reference");

-- CreateIndex
CREATE INDEX "GiftCardEntry_giftCardId_createdAt_idx" ON "GiftCardEntry"("giftCardId", "createdAt");

-- CreateIndex
CREATE INDEX "_CollectionCareGuides_B_index" ON "_CollectionCareGuides"("B");

-- CreateIndex
CREATE INDEX "_CategoryCareGuides_B_index" ON "_CategoryCareGuides"("B");

-- CreateIndex
CREATE INDEX "_ProductCollections_B_index" ON "_ProductCollections"("B");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRelation" ADD CONSTRAINT "ProductRelation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRelation" ADD CONSTRAINT "ProductRelation_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareGuideProduct" ADD CONSTRAINT "CareGuideProduct_careSheetId_fkey" FOREIGN KEY ("careSheetId") REFERENCES "CareSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareGuideProduct" ADD CONSTRAINT "CareGuideProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComponent" ADD CONSTRAINT "OrderItemComponent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComponent" ADD CONSTRAINT "OrderItemComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSheet" ADD CONSTRAINT "CareSheet_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassRegistration" ADD CONSTRAINT "ClassRegistration_classEventId_fkey" FOREIGN KEY ("classEventId") REFERENCES "ClassEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_contactMessageId_fkey" FOREIGN KEY ("contactMessageId") REFERENCES "ContactMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepageSection" ADD CONSTRAINT "HomepageSection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardEntry" ADD CONSTRAINT "GiftCardEntry_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionCareGuides" ADD CONSTRAINT "_CollectionCareGuides_A_fkey" FOREIGN KEY ("A") REFERENCES "CareSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionCareGuides" ADD CONSTRAINT "_CollectionCareGuides_B_fkey" FOREIGN KEY ("B") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryCareGuides" ADD CONSTRAINT "_CategoryCareGuides_A_fkey" FOREIGN KEY ("A") REFERENCES "CareSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryCareGuides" ADD CONSTRAINT "_CategoryCareGuides_B_fkey" FOREIGN KEY ("B") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductCollections" ADD CONSTRAINT "_ProductCollections_A_fkey" FOREIGN KEY ("A") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductCollections" ADD CONSTRAINT "_ProductCollections_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

