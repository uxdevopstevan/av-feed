import SidebarImage from "./components/SidebarImage";
import SignageClient from "./components/SignageClient";

export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-white flex">
      <aside className="w-1/4 h-full bg-[#701a56] flex flex-col items-center justify-between p-10">
        <div className="w-full flex items-center justify-center pt-2">
          <SidebarImage
            src="/wia-logo.png"
            alt="Event logo"
            width={360}
            height={180}
            priority
          />
        </div>

        <div className="w-full flex items-center justify-center">
          <SidebarImage
            src="/qr-code.svg"
            alt="QR code"
            width={220}
            height={220}
          />
        </div>

        <div className="text-4xl font-bold text-center px-2 pb-2">
          Scan to join the live feed!
        </div>
      </aside>

      <section className="w-3/4 h-full flex flex-col">
        <SignageClient />
      </section>
    </div>
  );
}
