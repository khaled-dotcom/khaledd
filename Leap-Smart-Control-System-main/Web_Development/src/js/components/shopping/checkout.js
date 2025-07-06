import cart from "./cart.js";
import fetchProducts from "./products.js";
import { auth, db } from "../../firebase/firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import phoneInputValidator from "../../utils/phoneInputValidator.js";

// Initialize EmailJS
(function() {
  // Add EmailJS script
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
  script.async = true;
  script.onload = () => {
    window.emailjs.init("vNNcicG5JmPhSkPF4");
  };
  document.head.appendChild(script);
})();

let app = document.getElementById('app');
let temporaryContent = document.getElementById('temporaryContent');
const loadingOverlay = document.getElementById('loading-overlay');

// Handle mobile dropdown
const initMobileDropdown = () => {
  const userProfile = document.querySelector('.user-profile');
  if (!userProfile) return;

  // Toggle dropdown on click for mobile
  userProfile.addEventListener('click', (e) => {
    if (window.innerWidth <= 767) {
      e.preventDefault();
      userProfile.classList.toggle('active');
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 767 && 
        userProfile.classList.contains('active') && 
        !userProfile.contains(e.target)) {
      userProfile.classList.remove('active');
    }
  });

  // Close dropdown when clicking a link
  const dropdownLinks = userProfile.querySelectorAll('.profile-dropdown a');
  dropdownLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 767) {
        userProfile.classList.remove('active');
      }
    });
  });
};

// Load template file
const loadTemplate = async () => {
  try {
    const response = await fetch('../../pages/shopping/template.html');
    const html = await response.text();
    app.innerHTML = html;
    let contentTab = document.getElementById('contentTab');
    contentTab.innerHTML = temporaryContent.innerHTML;
    temporaryContent.innerHTML = null;
    await cart();
    await initCheckout();
  } catch (error) {
    console.error('Error loading template:', error);
    loadingOverlay.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Error loading checkout</div>
        <div class="loading-message">Please try again</div>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #ff6600; border: none; border-radius: 5px; cursor: pointer; color: #fff;">
          Retry
        </button>
      </div>
    `;
  }
};

loadTemplate();

const initCheckout = async () => {
  const cartItems = JSON.parse(localStorage.getItem('cart')) || [];
  const TAX_RATE = 0.14; // 14% value-added tax rate
  const BASE_SHIPPING_RATE = 10.00; // Base shipping rate

  // Get DOM elements
  const cartItemsContainer = document.querySelector('.cart-items');
  const subtotalElement = document.getElementById('subtotal');
  const shippingElement = document.getElementById('shipping');
  const taxElement = document.getElementById('tax');
  const totalElement = document.getElementById('total');
  const placeOrderButton = document.getElementById('placeOrder');

  // Input elements
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const addressInput = document.getElementById('address');
  const cityInput = document.getElementById('city');
  const townInput = document.getElementById('town');
  const phoneInput = document.getElementById('phone');

  // Initialize phone input validation
  if (phoneInput) {
    phoneInputValidator.init(phoneInput, {
      maxLength: 16,  // Increased to accommodate + symbol for country codes
      autoFormat: false
    });
  }

  // Fetch and populate user data
  const populateUserData = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        // Get user document from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // Populate the form fields
          fullNameInput.value = userData.fullName || `${userData.firstName} ${userData.lastName}` || '';
          emailInput.value = userData.email || user.email || '';
          phoneInput.value = userData.phone || '';
          
          // Make email and phone readonly since they're verified
          emailInput.readOnly = true;
          phoneInput.readOnly = true;

          // Set user profile image
          const userProfileImg = document.getElementById('user-profile-img');
          if (userProfileImg) {
            userProfileImg.src = userData.profilePicture || user.photoURL || 'https://i.ibb.co/277hTSg8/generic-profile.jpg';
            userProfileImg.onerror = () => {
              userProfileImg.src = 'https://i.ibb.co/277hTSg8/generic-profile.jpg';
            };
          }

          // Wait for profile image to load if it exists
          if (userProfileImg && userData.profilePicture) {
            await new Promise((resolve) => {
              if (userProfileImg.complete) {
                resolve();
              } else {
                userProfileImg.onload = resolve;
                userProfileImg.onerror = resolve;
              }
            });
          }

          // Initialize mobile dropdown after profile image is set
          initMobileDropdown();
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      loadingOverlay.innerHTML = `
        <div class="loading-container">
          <div class="loading-text">Error loading user data</div>
          <div class="loading-message">Please try again</div>
          <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #ff6600; border: none; border-radius: 5px; cursor: pointer; color: #fff;">
            Retry
          </button>
        </div>
      `;
      return;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Calculate and update order summary
  const updateOrderSummary = async () => {
    let subtotal = 0;
    const products = await fetchProducts();
    
    cartItems.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        subtotal += product.price * item.quantity;
      }
    });

    // Calculate shipping rate based on cart items
    const shipping = cartItems.length > 0 ? BASE_SHIPPING_RATE : 0;
    const tax = subtotal * TAX_RATE;
    const total = subtotal + shipping + tax;

    subtotalElement.textContent = formatCurrency(subtotal);
    shippingElement.textContent = formatCurrency(shipping);
    taxElement.textContent = formatCurrency(tax);
    totalElement.textContent = formatCurrency(total);

    return { subtotal, shipping, tax, total };
  };

  // Render cart items
  const renderCartItems = async () => {
    cartItemsContainer.innerHTML = '';
    const products = await fetchProducts();
    
    cartItems.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        // Add name and price to the cart item
        item.name = product.name;
        item.price = product.price;
        
        const itemElement = document.createElement('div');
        itemElement.classList.add('cart-item');
        itemElement.innerHTML = `
          <div class="item">
            <div class="image">
              <img src="${product.image}" alt="${product.name}">
            </div>
            <div class="name">${product.name}</div>
            <div class="quantity">x${item.quantity}</div>
            <div class="price">${formatCurrency(product.price * item.quantity)}</div>
          </div>
        `;
        cartItemsContainer.appendChild(itemElement);
      }
    });
  };

  // Form validation
  const validateForm = () => {
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput.value)) {
      alert('Please enter a valid email address');
      return false;
    }

    // Phone validation
    const phoneRegex = /^\d{12}$/;
    if (!phoneRegex.test(phoneInput.value.replace(/\D/g, ''))) {
      alert('Please enter a valid 12-digit phone number with the country code');
      return false;
    }

    // Check if all required fields are filled
    const requiredInputs = document.querySelectorAll('input[required]');
    for (const input of requiredInputs) {
      if (!input.value.trim()) {
        alert('Please fill in all required fields');
        return false;
      }
    }

    return true;
  };

  // Save order to Firestore
  const saveOrderToFirestore = async (orderData) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Add user ID and timestamp to order data
      const orderWithMetadata = {
        ...orderData,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Add order to Firestore
      const ordersRef = collection(db, 'orders');
      const docRef = await addDoc(ordersRef, orderWithMetadata);
      
      return docRef.id; // Return the order ID
    } catch (error) {
      console.error('Error saving order to Firestore:', error);
      throw error;
    }
  };

  // Handle order submission
  const handleOrderSubmission = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const { subtotal, shipping, tax, total } = await updateOrderSummary();

      const order = {
        orderId: Math.random().toString(36).substr(2, 9).toUpperCase(),
        customer: {
          fullName: fullNameInput.value,
          email: emailInput.value,
          address: addressInput.value,
          city: cityInput.value,
          town: townInput.value,
          phone: phoneInput.value
        },
        items: cartItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          product_id: item.product_id || item.id
        })),
        payment: {
          method: 'Cash on Delivery'
        },
        summary: {
          subtotal,
          shipping,
          tax,
          total
        },
        status: 'pending'
      };

      // Save order to Firestore
      const orderId = await saveOrderToFirestore(order);
      console.log('Order placed successfully with ID:', orderId);
      
      // Send order confirmation email using EmailJS
      try {
        const emailParams = {
          to_email: order.customer.email,
          to_name: order.customer.fullName,
          order_id: order.orderId,
          order_date: new Date().toLocaleDateString(),
          order_items: order.items.map(item => 
            `${item.name} x${item.quantity} - ${formatCurrency(item.price * item.quantity)}`
          ).join('\n'),
          order_subtotal: formatCurrency(order.summary.subtotal),
          order_shipping: formatCurrency(order.summary.shipping),
          order_tax: formatCurrency(order.summary.tax),
          order_total: formatCurrency(order.summary.total),
          delivery_address: `${order.customer.address}, ${order.customer.city}, ${order.customer.town}`,
          payment_method: order.payment.method
        };

        await window.emailjs.send(
          'service_qwds9at',
          'template_vsjou47',
          emailParams
        );
        
        console.log('Order confirmation email sent successfully');
      } catch (error) {
        console.error('Error sending order confirmation email:', error);
      }
      
      // Clear cart
      localStorage.removeItem('cart');
      
      // Show success modal
      const successModal = document.getElementById('successModal');
      successModal.classList.add('active');
      
      // Prevent scrolling when modal is open
      document.body.style.overflow = 'hidden';
      
      // Add click outside to close
      successModal.addEventListener('click', (e) => {
        if (e.target === successModal) {
          successModal.classList.remove('active');
          document.body.style.overflow = '';
          window.location.href = '../../pages/shopping/index.html';
        }
      });
    } catch (error) {
      console.error('Error placing order:', error);
      alert('There was an error processing your order. Please try again.');
    }
  };

  try {
    // Initialize page
    await populateUserData(); // Populate user data first
    await renderCartItems();
    await updateOrderSummary();

    // Add event listener to place order button
    placeOrderButton.addEventListener('click', handleOrderSubmission);

    // Hide loading screen and show content
    loadingOverlay.classList.add('hidden');
    temporaryContent.classList.add('loaded');
    document.body.classList.remove('loading'); // Remove loading class to enable scrolling
  } catch (error) {
    console.error('Error initializing checkout:', error);
    loadingOverlay.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Error initializing checkout</div>
        <div class="loading-message">Please try again</div>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #ff6600; border: none; border-radius: 5px; cursor: pointer; color: #fff;">
          Retry
        </button>
      </div>
    `;
  }
};
