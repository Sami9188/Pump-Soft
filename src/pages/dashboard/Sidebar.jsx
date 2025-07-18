import React from 'react';
import { Layout, Menu, Tooltip, Typography, Grid } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  DollarOutlined,
  BarChartOutlined,
  ShoppingCartOutlined,
  DatabaseOutlined,
  ToolOutlined,
  UserOutlined,
  ShopOutlined,
  ContainerOutlined,
  LineChartOutlined,
  RollbackOutlined,
  SwapOutlined,
  SettingOutlined,
  TeamOutlined,
  CreditCardOutlined,
  AppstoreOutlined,
  BankOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

const { Sider } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// Utility function to merge menu items from multiple roles
const mergeMenuItems = (menuLists) => {
  const menuMap = new Map();

  menuLists.forEach((menuList) => {
    menuList.forEach((item) => {
      if (!menuMap.has(item.key)) {
        menuMap.set(item.key, { ...item, children: item.children ? [...item.children] : undefined });
      } else if (item.children) {
        const existing = menuMap.get(item.key);
        if (existing.children) {
          const childMap = new Map(existing.children.map((child) => [child.key, child]));
          item.children.forEach((child) => {
            if (!childMap.has(child.key)) {
              childMap.set(child.key, child);
            }
          });
          existing.children = Array.from(childMap.values());
        } else {
          existing.children = [...item.children];
        }
      }
    });
  });

  return Array.from(menuMap.values());
};

// Updated role-specific menu items
const roleMenuItems = {
  admin: [
    {
      key: 'dashboard',
      icon: <DashboardOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard">Dashboard</Link>,
    },
    {
      key: 'bill',
      icon: <CreditCardOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/bills">Bills</Link>,
    },
    {
      key: 'cashflow',
      icon: <SwapOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/cashflow">Cash Flow</Link>,
    },
    {
      key: 'accounts',
      icon: <TeamOutlined style={{ fontSize: '18px' }} />,
      label: 'Accounts',
      children: [
        {
          key: 'all-accounts',
          icon: <AppstoreOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/allaccounts">All Accounts</Link>,
        },
        {
          key: 'accounts-bank',
          icon: <BankOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/banks">Bank</Link>,
        },
        {
          key: 'accounts-supplier',
          icon: <ShopOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/suppliers">Supplier</Link>,
        },
        {
          key: 'accounts-customer',
          icon: <UserOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/customers">Customer</Link>,
        },
        {
          key: 'accounts-expenses',
          icon: <DollarOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/expenses">Expenses</Link>,
        },
        {
          key: 'staff-accounts',
          icon: <IdcardOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/staff">Staff</Link>,
        },
      ],
    },
    {
      key: 'products',
      icon: <ShopOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/registration/products">Products</Link>,
    },
    {
      key: 'tanks',
      icon: <DatabaseOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/registration/tanks">Tanks</Link>,
    },
    {
      key: 'dispensers',
      icon: <ContainerOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/registration/dispensers">Dispensers</Link>,
    },
    {
      key: 'nozzle-attachment',
      icon: <ToolOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/registration/nozzle-attachments">Nozzles</Link>,
    },
    {
      key: 'dip-chart',
      icon: <LineChartOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/registration/dip-charts">Dip Charts</Link>,
    },
    {
      key: 'invoices',
      icon: <ShoppingCartOutlined style={{ fontSize: '18px' }} />,
      label: 'Invoices',
      children: [
        {
          key: 'purchase',
          icon: <ShoppingCartOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/invoices/purchase">Purchase</Link>,
        },
        {
          key: 'purchase-return',
          icon: <RollbackOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/invoices/purchase-return">Purchase Return</Link>,
        },
        {
          key: 'sale',
          icon: <DollarOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/invoices/sale">Sales</Link>,
        },
        {
          key: 'sale-return',
          icon: <SwapOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/invoices/sale-return">Sales Return</Link>,
        },
      ],
    },
    {
      key: 'reports',
      icon: <BarChartOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/daily-report">Daily Report</Link>,
    },
    {
      key: 'user-management',
      icon: <TeamOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/user-management">User Management</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/settings">Settings</Link>,
    },
  ],
  manager: [
    {
      key: 'reports',
      icon: <BarChartOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/daily-report">Daily Report</Link>,
    },
    {
      key: 'accounts',
      icon: <TeamOutlined style={{ fontSize: '18px' }} />,
      label: 'Accounts',
      children: [
        {
          key: 'accounts-customer',
          icon: <UserOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/customers">Customers</Link>,
        },
        {
          key: 'staff-accounts',
          icon: <IdcardOutlined style={{ fontSize: '16px' }} />,
          label: <Link to="/dashboard/registration/accounts/staff">Staff</Link>,
        },
      ],
    },
    {
      key: 'bill',
      icon: <CreditCardOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/bills">Bills</Link>,
    },
  ],
  salesman: [
    {
      key: 'customers',
      icon: <TeamOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/registration/accounts/customers">Customers</Link>,
    },
    {
      key: 'bill',
      icon: <CreditCardOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/dashboard/bills">Bills</Link>,
    },
  ],
};

const Sidebar = ({ collapsed, onClose }) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const screens = useBreakpoint();

  const userRoles = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : ['guest'];
  const userMenuLists = userRoles.map((r) => roleMenuItems[r] || []);
  const mergedMenuItems = mergeMenuItems(userMenuLists);

  const commonItems = [];
  const menuItems = [...commonItems, ...mergedMenuItems];

  const getSelectedKeys = () => {
    const path = location.pathname.split('/').filter(Boolean);
    if (path.length > 1) {
      if (path[1] === 'reports' && path.length > 2) {
        return [path[2] + '-report'];
      }
      return [path[1]];
    }
    return ['dashboard'];
  };

  const handleMenuClick = () => {
    if (!screens.lg && onClose) {
      onClose();
    }
  };

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onClose}
      breakpoint="lg"
      collapsedWidth={80}
      width={260}
      className="vh-100 sticky-top bg-transparent"
      style={{
        zIndex: 10,
        left: 0,
        transition: 'all 0.3s',
      }}
      theme="light"
    >
      <div className="d-flex flex-column h-100 bg-white rounded-end overflow-hidden">
        <div className="d-flex align-items-center justify-content-center h-auto py-4 border-bottom">
          {collapsed ? (
            <Tooltip title={settings?.name || "Petrol Pump Management"} placement="right">
              <div
                className="d-flex justify-content-center align-items-center w-100"
                style={{
                  transition: 'transform 0.3s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <img
                  src={settings?.collapsedLogoUrl || 'https://via.placeholder.com/40'}
                  alt={settings?.name || 'Petrol Pump Logo'}
                  className="img-fluid"
                  style={{ maxHeight: '40px' }}
                />
              </div>
            </Tooltip>
          ) : (
            <div
              className="d-flex justify-content-center align-items-center w-100"
              style={{
                transition: 'transform 0.3s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <img
                src={settings?.logoUrl || 'https://via.placeholder.com/160x40'}
                alt={settings?.name || 'Petrol Pump Logo'}
                className="img-fluid"
                style={{ maxHeight: '50px' }}
              />
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="p-3 mx-2 mt-3 mb-2 bg-light rounded">
            <Text type="secondary" className="fs-8 text-uppercase" style={{ letterSpacing: '0.5px' }}>
              LOGGED IN AS
            </Text>
            <div className="fw-bold text-primary fs-6 mt-1">
              {Array.isArray(user?.role) ? user.role.join(', ') : user?.role || 'Guest'}
            </div>
          </div>
        )}

        <div className="flex-grow-1 overflow-auto px-1" style={{ scrollbarWidth: 'none' }}>
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={getSelectedKeys()}
            defaultOpenKeys={collapsed ? [] : ['reports']}
            items={menuItems}
            className="border-0 fw-medium bg-transparent"
            onClick={handleMenuClick}
          />
        </div>
      </div>
    </Sider>
  );
};

export default Sidebar;