import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Product from "./pages/Product.jsx";

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">Store<span>watch</span></Link>
        <p>INE mock store · scrape, wait, log honestly</p>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/product/:id" element={<Product />} />
      </Routes>
    </div>
  );
}
