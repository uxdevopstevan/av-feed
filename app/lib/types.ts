export type PromoSlide = {
  kind: "promo";
  id: string;
  title: string;
  subtitle?: string;
  imageSrc?: string;
};

export type LivePostComment = {
  id: number;
  authorName: string;
  authorAvatarUrl?: string | null;
  text: string;
  createdAt?: string;
  imageUrls?: string[];
  videoUrls?: string[];
};

export type CommentImageSlide = {
  kind: "commentImage";
  id: string;
  postId: number;
  commentId: number;
  authorName: string;
  text: string;
  createdAt?: string;
  imageUrl: string;
};

export type LivePostSlide = {
  kind: "post";
  id: number;
  authorName: string;
  caption: string;
  imageUrl?: string | null;
  updatedAt?: string;
  commentsCount?: number;
  comments: LivePostComment[];
};

export type DisplayItem = PromoSlide | LivePostSlide | CommentImageSlide;

export type SignageSnapshot = {
  dayKey: string | null;
  generatedAt: string;
  signature: string;
  posts: Array<{
    id: number;
    authorName: string;
    authorAvatarUrl?: string | null;
    caption: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    videoPosterUrl?: string | null;
    updatedAt?: string;
    commentsCount?: number;
  }>;
  commentsByPostId: Record<string, LivePostComment[]>;
};

