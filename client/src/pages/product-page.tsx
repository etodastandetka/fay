import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Product, Review, InsertReview } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { 
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, ShoppingCart, Bell, Star, AlertTriangle, ChevronLeft, Truck, Clock, CreditCard, QrCode } from "lucide-react";

// Review form schema
const reviewSchema = z.object({
  rating: z.number().min(1, "Выберите оценку").max(5, "Выберите оценку"),
  text: z.string().min(10, "Минимальная длина отзыва - 10 символов").max(500, "Максимальная длина отзыва - 500 символов"),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const productId = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [notifying, setNotifying] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  
  // Fetch product details
  const { data: product, isLoading: isLoadingProduct } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Товар не найден");
        }
        throw new Error("Ошибка при загрузке товара");
      }
      return res.json();
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
      setLocation("/catalog");
    }
  });
  
  // Fetch product reviews
  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: [`/api/reviews?productId=${productId}`],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string);
      if (!res.ok) throw new Error("Failed to fetch reviews");
      return res.json();
    },
    enabled: !!productId,
  });
  
  // Add to cart
  const addToCart = () => {
    if (!product) return;
    
    // Get current cart from localStorage
    const cartJson = localStorage.getItem("cart") || "[]";
    let cart = JSON.parse(cartJson);
    
    // Check if product is already in cart
    const existingItemIndex = cart.findIndex((item: any) => item.id === product.id);
    
    if (existingItemIndex >= 0) {
      // Increment quantity
      cart[existingItemIndex].quantity += 1;
    } else {
      // Add new item
      cart.push({
        id: product.id,
        name: product.name,
        image: product.images[0],
        price: product.price,
        quantity: 1
      });
    }
    
    // Save cart
    localStorage.setItem("cart", JSON.stringify(cart));
    
    // Update cart query
    queryClient.setQueryData(["/api/cart"], cart);
    
    // Show toast
    toast({
      title: "Товар добавлен",
      description: `${product.name} добавлен в корзину`,
    });
  };
  
  // Subscribe to notifications
  const subscribeToNotifications = async () => {
    if (!product || !user) {
      toast({
        title: "Требуется авторизация",
        description: "Пожалуйста, войдите в аккаунт, чтобы подписаться на уведомления",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setNotifying(true);
      
      await apiRequest("POST", "/api/notifications", {
        userId: user.id,
        productId: product.id,
        type: "availability"
      });
      
      toast({
        title: "Подписка оформлена",
        description: `Вы получите уведомление, когда ${product.name} появится в наличии`,
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось подписаться на уведомления",
        variant: "destructive"
      });
    } finally {
      setNotifying(false);
    }
  };
  
  // Review form
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 0,
      text: "",
    },
  });
  
  // Submit review mutation
  const reviewMutation = useMutation({
    mutationFn: async (data: InsertReview) => {
      const res = await apiRequest("POST", "/api/reviews", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/reviews?productId=${productId}`] });
      toast({
        title: "Отзыв отправлен",
        description: "Ваш отзыв будет опубликован после проверки модератором",
      });
      setReviewDialogOpen(false);
      form.reset();
      setSelectedRating(0);
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleReviewSubmit = (formData: ReviewFormValues) => {
    if (!user || !product) return;
    
    const reviewData: InsertReview = {
      userId: user.id,
      productId: product.id,
      rating: formData.rating,
      text: formData.text,
      images: [],
    };
    
    reviewMutation.mutate(reviewData);
  };
  
  // Format price
  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('ru-RU').format(typeof price === 'string' ? parseFloat(price) : price);
  };
  
  // Calculate discount percentage
  const calculateDiscount = (price: string | number, originalPrice: string | number | undefined) => {
    if (!originalPrice) return 0;
    
    const currentPrice = typeof price === 'string' ? parseFloat(price) : price;
    const original = typeof originalPrice === 'string' ? parseFloat(originalPrice) : originalPrice;
    
    return Math.round(((original - currentPrice) / original) * 100);
  };
  
  if (isLoadingProduct) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <AlertTriangle className="h-16 w-16 text-error mb-4" />
        <h1 className="text-2xl font-bold mb-2">Товар не найден</h1>
        <p className="text-gray-600 mb-6">Извините, запрашиваемый товар не найден или был удален</p>
        <Button onClick={() => setLocation("/catalog")}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Вернуться в каталог
        </Button>
      </div>
    );
  }
  
  const {
    name,
    description,
    images,
    price,
    originalPrice,
    quantity,
    isAvailable,
    category,
    labels = [],
    deliveryCost
  } = product;
  
  const discountPercentage = calculateDiscount(price, originalPrice);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          className="text-gray-600 hover:text-primary"
          onClick={() => setLocation("/catalog")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Назад в каталог
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Product Images */}
        <div>
          <Carousel className="w-full max-w-md mx-auto">
            <CarouselContent>
              {images.map((image, index) => (
                <CarouselItem key={index}>
                  <div className="p-1">
                    <div className="aspect-square relative bg-white rounded-md overflow-hidden">
                      <img
                        src={image}
                        alt={`${name} фото ${index + 1}`}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
        
        {/* Product Info */}
        <div>
          <h1 className="heading font-montserrat font-bold text-2xl md:text-3xl mb-2">{name}</h1>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-block bg-gray-100 text-gray-800 text-xs px-3 py-1 rounded-full">
              {category}
            </span>
            
            {labels.includes("Скидка") && (
              <span className="inline-block bg-secondary text-white text-xs px-3 py-1 rounded-full">
                Скидка {discountPercentage}%
              </span>
            )}
            
            {labels.includes("Растение с фото") && (
              <span className="inline-block bg-accent text-white text-xs px-3 py-1 rounded-full">
                Растение с фото
              </span>
            )}
            
            {labels.includes("Без выбора") && (
              <span className="inline-block bg-gray-500 text-white text-xs px-3 py-1 rounded-full">
                Без выбора
              </span>
            )}
          </div>
          
          <div className="mb-6">
            <div className="flex items-baseline mb-2">
              <span className="text-2xl font-bold text-primary mr-2">
                {formatPrice(price)} ₽
              </span>
              
              {originalPrice && (
                <span className="text-gray-400 line-through">
                  {formatPrice(originalPrice)} ₽
                </span>
              )}
            </div>
            
            <p className={`text-sm ${isAvailable ? 'text-success' : 'text-error'} mb-1`}>
              {isAvailable ? 'В наличии' : 'Нет в наличии'}
            </p>
            
            {isAvailable && (
              <p className="text-sm text-gray-600">
                Осталось: {quantity} шт.
              </p>
            )}
          </div>
          
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">
              Стоимость доставки: от {formatPrice(deliveryCost)} ₽
            </p>
          </div>
          
          <div className="mb-8">
            {isAvailable ? (
              <Button 
                className="bg-secondary hover:bg-yellow-500 text-white w-full md:w-auto"
                onClick={addToCart}
              >
                <ShoppingCart className="mr-2 h-5 w-5" />
                Добавить в корзину
              </Button>
            ) : (
              <Button 
                className="bg-primary hover:bg-green-700 text-white w-full md:w-auto"
                onClick={subscribeToNotifications}
                disabled={notifying || !user}
              >
                {notifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Подписка...
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 h-5 w-5" />
                    Уведомить о наличии
                  </>
                )}
              </Button>
            )}
          </div>
          
          <div className="prose max-w-none">
            <h3 className="heading font-montserrat font-semibold text-lg mb-2">Описание</h3>
            <p>{description}</p>
          </div>
        </div>
      </div>
      
      {/* Tabs for Reviews and Delivery Info */}
      <Tabs defaultValue="reviews" className="mb-12">
        <TabsList className="mb-6">
          <TabsTrigger value="reviews">Отзывы ({reviews.length})</TabsTrigger>
          <TabsTrigger value="delivery">Доставка и оплата</TabsTrigger>
          <TabsTrigger value="care">Уход за растением</TabsTrigger>
        </TabsList>
        
        <TabsContent value="reviews">
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="heading font-montserrat font-semibold text-xl">Отзывы о товаре</h2>
              
              <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    disabled={!user}
                    variant="outline"
                  >
                    Оставить отзыв
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Оставить отзыв</DialogTitle>
                    <DialogDescription>
                      Поделитесь своим мнением о {name}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleReviewSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="rating"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Оценка</FormLabel>
                            <FormControl>
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((rating) => (
                                  <button
                                    key={rating}
                                    type="button"
                                    onClick={() => {
                                      setSelectedRating(rating);
                                      field.onChange(rating);
                                    }}
                                    className="focus:outline-none"
                                  >
                                    <Star
                                      className={`h-6 w-6 ${
                                        rating <= selectedRating || rating <= field.value
                                          ? "text-secondary fill-current"
                                          : "text-gray-300"
                                      }`}
                                    />
                                  </button>
                                ))}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="text"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Текст отзыва</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Поделитесь вашим мнением о товаре..."
                                rows={5}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <DialogFooter>
                        <Button
                          type="submit"
                          className="bg-primary hover:bg-green-700 text-white"
                          disabled={reviewMutation.isPending}
                        >
                          {reviewMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Отправка...
                            </>
                          ) : (
                            "Отправить отзыв"
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
            
            {reviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reviews.map((review) => (
                  <Card key={review.id}>
                    <CardHeader>
                      <div className="flex justify-between">
                        <div>
                          <CardTitle className="text-base">Пользователь #{review.userId}</CardTitle>
                          <CardDescription>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</CardDescription>
                        </div>
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating ? "text-secondary fill-current" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p>{review.text}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-600 mb-2">У этого товара пока нет отзывов</p>
                <p className="text-sm">Будьте первым, кто оставит отзыв!</p>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="delivery">
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-lg mb-3">Информация о доставке</h3>
            
              <div className="space-y-4">
                <div>
                  <p className="font-medium">Стоимость доставки:</p>
                  {deliveryCost ? (
                    <p>{formatPrice(deliveryCost)} ₽</p>
                  ) : (
                    <p>350 ₽ (стандартная)</p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">
                    * При заказе от 5000 ₽ доставка бесплатная
                  </p>
                </div>
                
                <div>
                  <p className="font-medium">Способы доставки:</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li className="flex items-start">
                      <Truck className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>CDEK – доставка в большинство городов России</span>
                    </li>
                    <li className="flex items-start">
                      <Truck className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>Почта России – доставка в отдаленные регионы</span>
                    </li>
                  </ul>
                </div>
                
                <div>
                  <p className="font-medium">Сроки доставки:</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li className="flex items-start">
                      <Clock className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>Москва и Санкт-Петербург: 1-3 дня</span>
                    </li>
                    <li className="flex items-start">
                      <Clock className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>Другие города: 3-7 дней</span>
                    </li>
                    <li className="flex items-start">
                      <Clock className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>Отдаленные регионы: 7-14 дней</span>
                    </li>
              </ul>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-lg mb-3">Способы оплаты</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="font-medium">Онлайн-оплата:</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li className="flex items-start">
                      <CreditCard className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>Оплата банковской картой через ЮMoney</span>
                    </li>
              </ul>
            </div>
            
            <div>
                  <p className="font-medium">Прямой перевод:</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li className="flex items-start">
                      <QrCode className="h-4 w-4 text-primary mt-0.5 mr-2 flex-shrink-0" />
                      <span>Перевод по QR-коду или по реквизитам карты</span>
                    </li>
              </ul>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="care">
          <div className="prose max-w-none">
            <h3 className="heading font-montserrat font-semibold text-xl mb-4">Уход за растением</h3>
            
            <div className="mb-6">
              <h4 className="font-semibold mb-2">Освещение:</h4>
              <p>
                Большинство комнатных растений предпочитают яркий рассеянный свет. Разместите растение возле окна, защищая от прямых солнечных лучей, которые могут вызвать ожоги листьев.
              </p>
            </div>
            
            <div className="mb-6">
              <h4 className="font-semibold mb-2">Полив:</h4>
              <p>
                Частота полива зависит от вида растения, сезона и условий содержания. Общее правило - поливать, когда верхний слой почвы подсох на 2-3 см. Избегайте застоя воды в поддоне.
              </p>
            </div>
            
            <div className="mb-6">
              <h4 className="font-semibold mb-2">Влажность:</h4>
              <p>
                Тропические растения предпочитают повышенную влажность воздуха. Регулярно опрыскивайте листья или используйте увлажнитель воздуха.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Пересадка и удобрение:</h4>
              <p>
                Пересаживайте растения весной каждые 1-2 года. Используйте подходящий грунт и горшок с дренажными отверстиями. Подкармливайте растения в период активного роста (весна-лето) специальными удобрениями.
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Подробные инструкции по уходу за конкретным растением будут приложены к вашему заказу.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
