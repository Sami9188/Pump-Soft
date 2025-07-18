import React, { useState, useEffect } from 'react';
import { Layout, Button, Drawer, Typography, Avatar, Dropdown, Badge, Card, Row, Col } from 'antd';
import {
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  BellOutlined,
  UserOutlined,
  CalendarOutlined,
  SettingOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import Sidebar from './Sidebar';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';
import { useSettings } from '../../context/SettingsContext';

// Define role priority (highest to lowest)
const ROLE_PRIORITY = ['admin', 'manager', 'salesman', 'user'];

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

const DashboardLayout = ({ children }) => {
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [pageTitle, setPageTitle] = useState('Dashboard');
  const [currentDate, setCurrentDate] = useState(dayjs());

  // Compute the highest role for display
  const userRoles = user?.role || []; // Default to empty array if no roles
  const highestRole = ROLE_PRIORITY.find(role => userRoles.includes(role)) || 'guest';
  const displayRole = highestRole.charAt(0).toUpperCase() + highestRole.slice(1); // Capitalize, e.g., "Admin"

  // Update current date every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(dayjs());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setMobileView(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setDrawerVisible(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update page title based on current route
  useEffect(() => {
    const path = location.pathname.split('/').filter(Boolean);
    if (path.length > 1) {
      if (path[1] === 'reports' && path.length > 2) {
        const reportType = path[2].charAt(0).toUpperCase() + path[2].slice(1).replace(/-/g, ' ');
        setPageTitle(`${reportType} Report`);
      } else {
        const title = path[1].charAt(0).toUpperCase() + path[1].slice(1).replace(/-/g, ' ');
        setPageTitle(title);
      }
    } else {
      setPageTitle('Dashboard');
    }
  }, [location]);

  const handleMenuClick = (e) => {
    if (e.key === 'logout') {
      logout();
      navigate('/auth/login');
    } else if (e.key === 'profile') {
      navigate('/dashboard/profile');
    } else if (e.key === 'settings') {
      navigate('/dashboard/settings');
    }
  };

  const userMenuItems = [
    ...(user?.role.includes('admin')
      ? [{
        key: 'settings',
        label: 'Settings',
        icon: <SettingOutlined />,
      }]
      : []),
    { type: 'divider' },
    {
      key: 'logout',
      label: 'Logout',
      icon: <LogoutOutlined />,
      danger: true,
    },
  ];

  const formattedDate = {
    day: currentDate.format('dddd'),
    date: currentDate.format('DD'),
    month: currentDate.format('MMMM'),
    year: currentDate.format('YYYY'),
    time: currentDate.format('hh:mm A'),
  };

  return (
    <Layout className="vh-100 overflow-hidden bg-light">
      {!mobileView && (
        <Layout.Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={280}
          className="h-100 position-fixed start-0 top-0 overflow-auto shadow-sm bg-white"
          style={{ zIndex: 10, scrollbarWidth: 'none' }}
        >
          <Sidebar collapsed={collapsed} onClose={() => setCollapsed(!collapsed)} />
        </Layout.Sider>
      )}

      {mobileView && (
        <Drawer
          placement="left"
          open={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          width={280}
          styles={{
            body: { padding: 0 },
            header: { display: 'none' },
            content: { boxShadow: '0 8px 16px rgba(0,0,0,0.12)' },
          }}
        >
          <Sidebar collapsed={false} onClose={() => setDrawerVisible(false)} />
        </Drawer>
      )}

      <Layout
        className="transition-all"
        style={{
          marginLeft: mobileView ? 0 : (collapsed ? 80 : 280),
          background: 'transparent',
        }}
      >
        <Header
          className="d-flex align-items-center justify-content-between sticky-top px-4 py-0 bg-white bg-opacity-80 shadow-sm"
          style={{
            backdropFilter: 'blur(8px)',
            height: '70px',
            borderRadius: mobileView ? '0' : '0 0 12px 12px',
            maxWidth: '98%',
            margin: '0 auto',
            zIndex: 9,
            width: '100%',
          }}
        >
          <div className="d-flex align-items-center">
            <Button
              type="text"
              icon={mobileView ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
              onClick={() => (mobileView ? setDrawerVisible(true) : setCollapsed(!collapsed))}
              className="d-flex align-items-center justify-content-center me-3"
              style={{ width: 40, height: 40, borderRadius: '10px' }}
            />
            <div className="d-flex flex-column">
              <Title level={4} className="m-0 text-primary">
                {pageTitle}
              </Title>
              {!mobileView && (
                <div className="d-flex align-items-center ms-1">
                  <CalendarOutlined className="me-2 text-primary" />
                  <Text type="secondary" className="fs-7">
                    {formattedDate.day}, {formattedDate.month} {formattedDate.date}, {formattedDate.year} - {formattedDate.time}
                  </Text>
                </div>
              )}
            </div>
          </div>

          <div className="d-flex align-items-center gap-3">
            <Badge count={3} size="small">
              <Button
                type="text"
                icon={<BellOutlined className="fs-4" />}
                className="d-flex align-items-center justify-content-center"
                style={{ width: 40, height: 40, borderRadius: '10px' }}
              />
            </Badge>

            <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight" trigger={['click']}>
              <div
                className="d-flex align-items-center gap-2 p-2 rounded bg-light cursor-pointer"
                style={{ cursor: 'pointer', borderRadius: '12px' }}
              >
                <Avatar icon={<UserOutlined />} className="shadow-sm me-2" size={36} />
                {!mobileView && (
                  <div className="me-2 d-flex flex-column">
                    <Text strong className="fs-6 lh-sm">{user?.name || 'User'}</Text>
                    <Text type="secondary" className="fs-7 lh-1">{displayRole}</Text>
                  </div>
                )}
                <SettingOutlined className="text-secondary fs-6" />
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          className="mx-auto my-4 overflow-auto"
          style={{
            width: '98%',
            height: 'calc(100vh - 70px - 48px - 48px)',
            scrollbarWidth: 'none',
          }}
        >
          <Card
            className="rounded shadow-sm bg-white bg-opacity-80 border-0"
            style={{ minHeight: '85vh', backdropFilter: 'blur(8px)' }}
          >
            {children}
          </Card>

          {mobileView && (
            <Card
              className="mt-3 rounded shadow-sm bg-white bg-opacity-80 border-0"
              style={{ backdropFilter: 'blur(8px)' }}
            >
              <Row className="align-items-center justify-content-center">
                <Col>
                  <CalendarOutlined className="text-primary me-2" />
                  <Text type="secondary">
                    {formattedDate.day}, {formattedDate.month} {formattedDate.date}, {formattedDate.year}
                  </Text>
                </Col>
              </Row>
            </Card>
          )}
        </Content>

        <Footer className="text-center py-3 bg-transparent border-0">
          <Text type="secondary" className="fs-7">{settings?.name} ©{new Date().getFullYear()}</Text>
        </Footer>
      </Layout>
    </Layout>
  );
};

export default DashboardLayout;