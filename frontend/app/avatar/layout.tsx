export default function AvatarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "transparent" }}>
      {children}
    </div>
  );
}
