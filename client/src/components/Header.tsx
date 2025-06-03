import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import ExternalLink from "@/components/ExternalLink";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sprout, User, ShoppingCart, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function Header() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get cart items count
  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
    queryFn: () => {
      // For now, we'll use localStorage
      const storedCart = localStorage.getItem("cart");
      return storedCart ? JSON.parse(storedCart) : [];
    },
  });

  const cartItemsCount = cartItems.length;

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <header className="bg-white sticky top-0 z-50 shadow-sm">
      <nav className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button 
            className="lg:hidden mr-3 text-neutral-dark" 
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <Link href="/" className="font-montserrat font-bold text-xl text-primary flex items-center">
            <Sprout className="mr-2 h-6 w-6" />
            <span>Jungle Plants</span>
          </Link>
        </div>
        
        <div className="hidden lg:flex items-center space-x-6 text-neutral-dark">
          <Link href="/catalog" className={`hover:text-primary transition-colors ${location === "/catalog" ? "text-primary" : ""}`}>
            Каталог
          </Link>
          <Link href="/faq" className={`hover:text-primary transition-colors ${location === "/faq" ? "text-primary" : ""}`}>
            Доставка
          </Link>
          <Link href="/faq" className={`hover:text-primary transition-colors ${location === "/faq" ? "text-primary" : ""}`}>
            Оплата
          </Link>
          <ExternalLink href="https://t.me/junglefeedback" className="hover:text-primary transition-colors">
            Отзывы
          </ExternalLink>
          <Link href="/faq" className={`hover:text-primary transition-colors ${location === "/faq" ? "text-primary" : ""}`}>
            FAQ
          </Link>
        </div>
        
        <div className="flex items-center">
          <Link href="/cart" className="text-neutral-dark hover:text-primary transition-colors relative mr-4">
            <ShoppingCart className="h-6 w-6" />
            {cartItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-secondary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cartItemsCount}
              </span>
            )}
          </Link>
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-neutral-dark hover:text-primary transition-colors">
                  <User className="h-6 w-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Мой аккаунт</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">Профиль</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile?tab=orders">Мои заказы</Link>
                </DropdownMenuItem>
                {user.isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin">Админ панель</Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/auth">
              <Button variant="ghost" size="icon" className="text-neutral-dark hover:text-primary transition-colors">
                <User className="h-6 w-6" />
              </Button>
            </Link>
          )}
        </div>
      </nav>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white absolute w-full py-3 shadow-md animate-fadeIn">
          <div className="container mx-auto px-4 flex flex-col space-y-3">
            <Link href="/catalog" onClick={closeMobileMenu} className="py-2 hover:text-primary transition-colors">
              Каталог
            </Link>
            <Link href="/faq" onClick={closeMobileMenu} className="py-2 hover:text-primary transition-colors">
              Доставка
            </Link>
            <Link href="/faq" onClick={closeMobileMenu} className="py-2 hover:text-primary transition-colors">
              Оплата
            </Link>
            <ExternalLink href="https://t.me/junglefeedback" onClick={closeMobileMenu} className="py-2 hover:text-primary transition-colors">
              Отзывы
            </ExternalLink>
            <Link href="/faq" onClick={closeMobileMenu} className="py-2 hover:text-primary transition-colors">
              FAQ
            </Link>
            <div className="pt-2 border-t border-gray-100">
              {user ? (
                <>
                  <Link href="/profile" onClick={closeMobileMenu} className="py-2 block hover:text-primary transition-colors">
                    Мой профиль
                  </Link>
                  <Link href="/profile?tab=orders" onClick={closeMobileMenu} className="py-2 block hover:text-primary transition-colors">
                    Мои заказы
                  </Link>
                  {user.isAdmin && (
                    <Link href="/admin" onClick={closeMobileMenu} className="py-2 block hover:text-primary transition-colors">
                      Админ панель
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      handleLogout();
                      closeMobileMenu();
                    }}
                    className="py-2 text-left w-full hover:text-primary transition-colors"
                  >
                    Выйти
                  </button>
                </>
              ) : (
                <Link href="/auth" onClick={closeMobileMenu} className="py-2 block hover:text-primary transition-colors">
                  Войти / Зарегистрироваться
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
