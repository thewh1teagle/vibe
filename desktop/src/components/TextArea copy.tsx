import { useLocalStorage } from "usehooks-ts";

export default function TextArea({
  result,
}: {
  result: string;
}) {
  const [direction, setDirection] = useLocalStorage(
    "direction",
    "ltr"
  );
  return (
    <form className="mt-5 result-area w-full">
      <div className="w-full mb-4 border border-base-200 rounded-lg bg-base-100">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex flex-wrap items-center divide-base-200 sm:divide-x">
            <div className="flex items-center space-x-1 sm:pr-4">
              <button
                onClick={() =>
                  navigator.clipboard.writeText(result)
                }
                type="button"
                className="p-2 text-base-content rounded cursor-pointer hover:text-base-content hover:bg-base-100 className=text-gray-400 className=hover:text-white className=hover:bg-gray-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                  />
                </svg>
              </button>
              <button
                onClick={() => setDirection("ltr")}
                type="button"
                className={`p-2 text-gray-500 rounded cursor-pointer ${
                  direction === "ltr"
                    ? "text-gray-900 bg-base-100"
                    : null
                } hover:text-gray-900 hover:bg-gray-100 className=text-gray-400 className=hover:text-white className=hover:bg-gray-600`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                  />
                </svg>
              </button>
              <button
                onClick={() => setDirection("rtl")}
                type="button"
                className={`p-2 text-gray-500 rounded cursor-pointer ${
                  direction === "rtl"
                    ? "text-gray-900 bg-base-100"
                    : null
                } hover:text-gray-900 hover:bg-base-100`}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="pt-1 bg-base-100 rounded-b-lg className=bg-gray-800">
          <textarea
            disabled
            value={result}
            id="editor"
            rows={8}
            className={`pl-2 pt-2 pr-2 pb-2 block w-full min-h-[300px] px-0 text-sm hover:outline-none active:outline-none outline-none text-gray-800 bg-base-100 border-0 focus:ring-0 ${
              direction === "ltr" ? "ltr" : "rtl"
            }`}
            placeholder=""
            required></textarea>
        </div>
      </div>
    </form>
  );
}
